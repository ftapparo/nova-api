import type http from 'node:http';
import logger from '../../core/utils/logger';
import { listAvailableGates } from '../../core/repositories/control.repository';
import { accessControlEvents, getAccessControlStatusCache } from '../../core/services/access-control.service';
import { exhaustEvents } from '../../core/services/exhaust.service';
import type { CommandLogEntry } from '../../core/services/command-log.service';
import { commandLogEvents } from '../shared/command-audit';
import type { Actor } from '../shared/require-auth';
import { getResidence } from '../residence/residence.service';
import { resolveAllowedIds, toExhaust } from '../exhaust/exhaust.routes';
import { resolveTagServiceToken, resolveTagV3BaseUrl } from '../tag/tag.routes';
import type { Exhaust } from '../exhaust/exhaust.schema';
import { ApiWsBroker, type WsAudience } from './ws-broker';
import { UpstreamSocket } from './ws-upstream';

// =============================================================================
// Liga as fontes de evento ao WebSocket dos clientes (/v3/ws):
//
// | Evento                                        | Origem              | Quem recebe                    |
// |-----------------------------------------------|---------------------|--------------------------------|
// | cie.*                                         | /v3/ws do nova-cie  | equipe + morador ativo         |
// | gate.state.changed, antenna.connection.changed, tag.read | /v3/ws de cada nova-tag | equipe          |
// | upstream.connection.changed                   | este gateway        | cie: equipe + morador; tag: equipe |
// | exhaust.changed                               | core/exhaust        | equipe; morador só a prumada   |
// | devices.status.changed                        | core/access-control | equipe                         |
// | command.logged                                | shared/command-audit| equipe                         |
//
// O cliente busca o estado atual por REST e aplica os eventos por cima.
// =============================================================================

const STAFF_ROLES = ['porteiro', 'sindico', 'admin'];

const isStaff = (audience: WsAudience) => audience.staff;
const isStaffOrResident = (audience: WsAudience) => audience.staff || audience.resident;

// Lidas dentro das funções: imports resolvem antes do dotenv.config().
const resolveCieWsUrl = (): string =>
    `${(process.env.CIE_V3_BASE_URL || 'http://nova-cie:3031').trim().replace(/\/+$/, '').replace(/^http/, 'ws')}/v3/ws`;
const resolveCieServiceToken = (): string => process.env.CIE_SERVICE_TOKEN ?? '';
const positiveEnv = (name: string, fallback: number): number => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

const resolveAudience = async (actor: Actor): Promise<WsAudience> => {
    const staff = !!actor.role && STAFF_ROLES.includes(actor.role);
    if (staff) return { actor, staff, resident: false, exhaustIds: new Set() };

    const residence = await getResidence(actor.id);
    return {
        actor,
        staff: false,
        resident: !residence.blocked,
        exhaustIds: new Set(residence.blocked ? [] : await resolveAllowedIds(actor)),
    };
};

// A CIE usa "connection.status.changed" para a conexão dela com a central;
// renomeado para não confundir com a conexão do próprio socket.
const renameCieEvent = (event: string) => (event === 'connection.status.changed' ? 'cie.connection.changed' : event);

const connectCie = (broker: ApiWsBroker) => {
    const token = resolveCieServiceToken();
    if (!token) {
        logger.warn('[ApiV3 WS] CIE_SERVICE_TOKEN ausente — eventos da central de incêndio desativados.');
        return;
    }
    new UpstreamSocket({
        name: 'cie',
        url: resolveCieWsUrl(),
        token,
        onMessage: ({ event, data }) => broker.publish(renameCieEvent(event), data, isStaffOrResident),
        onConnectionChange: (connected) =>
            broker.publish('upstream.connection.changed', { service: 'cie', connected }, isStaffOrResident),
    }).start();
};

const TAG_EVENTS = new Set(['gate.state.changed', 'antenna.connection.changed', 'tag.read']);

const connectTags = async (broker: ApiWsBroker) => {
    const token = resolveTagServiceToken();
    if (!token) {
        logger.warn('[ApiV3 WS] TAG_SERVICE_TOKEN ausente — eventos dos portões desativados.');
        return;
    }

    let gates;
    try {
        gates = (await listAvailableGates()).filter((gate) => gate.ativo === 'S');
    } catch (error) {
        // Firebird fora no boot: tenta de novo em 1 min, sem derrubar o resto.
        logger.error('[ApiV3 WS] Falha ao listar portões para o WebSocket; nova tentativa em 60 s:', error);
        setTimeout(() => void connectTags(broker), 60_000).unref();
        return;
    }

    for (const gate of gates) {
        const numeroDispositivo = gate.numeroDispositivo;
        new UpstreamSocket({
            name: `tag${numeroDispositivo}`,
            url: `${resolveTagV3BaseUrl(numeroDispositivo).replace(/^http/, 'ws')}/v3/ws`,
            token,
            onMessage: ({ event, data }) => {
                if (TAG_EVENTS.has(event)) broker.publish(event, data, isStaff);
            },
            onConnectionChange: (connected) =>
                broker.publish('upstream.connection.changed', { service: 'tag', numeroDispositivo, connected }, isStaff),
        }).start();
    }
};

const watchExhausts = (broker: ApiWsBroker) => {
    const last = new Map<string, string>();
    let pending: NodeJS.Timeout | null = null;

    // Um comando grava a memória várias vezes em sequência (iniciando →
    // executado); agrupa em 300 ms e publica só o que mudou.
    const flush = async () => {
        pending = null;
        const ids = [...'ABC'].flatMap((tower) => [1, 2, 3, 4, 5, 6, 7, 8].map((final) => `${tower}${final}`));
        const exhausts: Exhaust[] = await Promise.all(ids.map(toExhaust));
        for (const exhaust of exhausts) {
            const key = JSON.stringify(exhaust);
            if (last.get(exhaust.id) === key) continue;
            const firstRun = !last.has(exhaust.id);
            last.set(exhaust.id, key);
            if (firstRun) continue;
            broker.publish('exhaust.changed', exhaust, (audience) => audience.staff || audience.exhaustIds.has(exhaust.id));
        }
    };

    const schedule = () => {
        if (pending) return;
        pending = setTimeout(() => {
            flush().catch((error) => logger.error('[ApiV3 WS] Falha ao publicar exaustores:', error));
        }, 300);
    };

    exhaustEvents.on('memory.changed', schedule);
    schedule();
};

const watchDevices = (broker: ApiWsBroker) => {
    const gatesOnline = new Map<number, boolean>();
    const doorsOnline = new Map<number, boolean>();

    accessControlEvents.on('status.updated', () => {
        try {
            const cache = getAccessControlStatusCache();
            const gates = cache.gates.filter((gate) => {
                const changed = gatesOnline.has(gate.numeroDispositivo) && gatesOnline.get(gate.numeroDispositivo) !== gate.online;
                gatesOnline.set(gate.numeroDispositivo, gate.online);
                return changed;
            });
            const doors = cache.doors.filter((door) => {
                const changed = doorsOnline.has(door.id) && doorsOnline.get(door.id) !== door.online;
                doorsOnline.set(door.id, door.online);
                return changed;
            });
            if (gates.length === 0 && doors.length === 0) return;
            broker.publish('devices.status.changed', {
                updatedAt: cache.updatedAt,
                gates: gates.map((gate) => ({ numeroDispositivo: gate.numeroDispositivo, nome: gate.nome, online: gate.online })),
                doors: doors.map((door) => ({ id: door.id, nome: door.nome, online: door.online })),
            }, isStaff);
        } catch (error) {
            // Listener síncrono do core: exceção aqui não pode vazar para o monitoramento.
            logger.error('[ApiV3 WS] Falha ao publicar status de equipamentos:', error);
        }
    });
};

const watchCommandLog = (broker: ApiWsBroker) => {
    commandLogEvents.on('logged', (entry: CommandLogEntry) => {
        try {
            const { ip: _ip, ...visible } = entry;
            broker.publish('command.logged', visible, isStaff);
        } catch (error) {
            logger.error('[ApiV3 WS] Falha ao publicar comando:', error);
        }
    });
};

/**
 * Sobe o /v3/ws no servidor HTTP do Fastify da v3. Falha aqui não derruba
 * as rotas REST: o WebSocket é complemento, o estado continua disponível
 * por polling.
 */
export function startWsGateway(server: http.Server): ApiWsBroker {
    const broker = new ApiWsBroker(server, {
        path: '/v3/ws',
        maxClients: positiveEnv('API_WS_MAX_CLIENTS', 200),
        maxClientsPerAccount: positiveEnv('API_WS_MAX_CLIENTS_PER_ACCOUNT', 3),
        heartbeatMs: 30_000,
        resolveAudience,
    });

    connectCie(broker);
    void connectTags(broker);
    watchExhausts(broker);
    watchDevices(broker);
    watchCommandLog(broker);

    logger.info('[ApiV3 WS] WebSocket /v3/ws ativo');
    return broker;
}
