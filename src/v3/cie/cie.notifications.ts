import logger from '../../core/utils/logger';
import * as notificationRepository from '../../core/repositories/notification.repository';
import { cieUpstreamEvents } from '../ws/ws.gateway';
import { notifySafely, type AppNotification, type NotificationKind } from '../notification/notification.service';

// =============================================================================
// Push da central de incêndio. O nova-cie só manda estado (cie.status.updated
// a cada consulta, cie.alarm.triggered repetido enquanto dura o alarme); as
// bordas são detectadas aqui, a partir dos contadores e da conexão:
//
// | Borda                                   | Aviso             | Público                  |
// |-----------------------------------------|-------------------|--------------------------|
// | alarme 0 → >0                           | cie.alarm         | equipe + morador ativo   |
// | alarme >0 → 0                           | cie.alarm.cleared | equipe                   |
// | falha / supervisão / bloqueio 0 → >0    | cie.failure …     | equipe                   |
// | central reiniciando                     | cie.restarting    | equipe                   |
// | sem contato por NOTIFY_CIE_OFFLINE_MINUTES | cie.offline    | equipe                   |
// | volta ao normal depois de falha, supervisão, reinício ou sem contato | cie.normalized | equipe |
//
// Morador recebe só o alarme (decisão de 13/10/2026); a prioridade vem da
// gravidade, nunca da localização. Alarme não depende de preferência: o
// controle é do canal no aparelho.
//
// Uma borda de descida só vale depois de 30 s estável, para uma oscilação do
// contador não virar outro aviso. Ao subir a API com alarme ativo, o alarme é
// enviado se nenhum foi enviado nos últimos 10 min: repetir é melhor que
// perder um alarme de incêndio.
// =============================================================================

const CLEAR_AFTER_MS = 30_000;
const TICK_MS = 15_000;
const ALARM_RESEND_WINDOW_MS = 10 * 60_000;

type Flag = 'alarm' | 'failure' | 'supervision' | 'blocked' | 'restarting' | 'offline';
const COUNTER_FLAGS: Flag[] = ['alarm', 'failure', 'supervision', 'blocked'];
// Estados cuja volta gera "central normalizada".
const ABNORMAL_FLAGS: Flag[] = ['failure', 'supervision', 'restarting', 'offline'];

// Lida dentro da função: imports resolvem antes do dotenv.config().
const offlineMinutes = (): number => {
    const value = Number(process.env.NOTIFY_CIE_OFFLINE_MINUTES);
    return Number.isFinite(value) && value > 0 ? value : 5;
};

type FlagState = { active: boolean; raw: boolean; pendingSince: number | null };

const flags = new Map<Flag, FlagState>(
    (['alarm', 'failure', 'supervision', 'blocked', 'restarting', 'offline'] as Flag[])
        .map((flag) => [flag, { active: false, raw: false, pendingSince: null }]),
);

let ready = false;
let upstreamConnected = false;
let panelConnected = true;
let abnormalNotified = false;
/** Itens ativos por tipo (alarme, falha, supervisão), do último cie.active.updated. */
const activeItems = new Map<string, unknown[]>();

const state = (flag: Flag) => flags.get(flag)!;

const riseDelay = (flag: Flag) => (flag === 'offline' ? offlineMinutes() * 60_000 : 0);

/** Aplica o valor bruto e devolve a borda confirmada, se houver. */
const settle = (flag: Flag, now: number): 'rise' | 'fall' | null => {
    const current = state(flag);
    if (current.raw === current.active) {
        current.pendingSince = null;
        return null;
    }
    current.pendingSince ??= now;
    const delay = current.raw ? riseDelay(flag) : CLEAR_AFTER_MS;
    if (now - current.pendingSince < delay) return null;
    current.active = current.raw;
    current.pendingSince = null;
    return current.active ? 'rise' : 'fall';
};

type Place = { towerLabel?: string | null; floorLabel?: string | null; area?: string | null };

/** "Torre B · 8º andar", com o número de outros locais, a partir dos itens interpretados pelo nova-cie. */
const describePlace = (type: string): string | null => {
    const items = activeItems.get(type) ?? [];
    const place = (items[0] as { display?: { place?: Place | null } } | undefined)?.display?.place;
    if (!place) return null;
    const parts = [place.towerLabel, place.floorLabel].filter((part): part is string => !!part);
    const text = parts.length > 0 ? parts.join(' · ') : place.area ?? null;
    if (!text) return null;
    return items.length > 1 ? `${text} e mais ${items.length - 1} local(is)` : text;
};

const staffNotice = (kind: NotificationKind, title: string, body: string, channel: 'cie_status' | 'cie_info'): AppNotification => ({
    kind,
    dedupeKey: `${kind}:${Date.now()}`,
    audience: { kind: 'staff' },
    preference: 'cieStaffAlerts',
    title,
    body,
    channel,
    priority: 'normal',
    ttlSeconds: 6 * 60 * 60,
    collapseKey: 'cie-status',
    target: 'fire',
});

const sendAlarm = () => {
    const place = describePlace('alarme');
    void notifySafely({
        kind: 'cie.alarm',
        dedupeKey: `cie.alarm:${Date.now()}`,
        audience: { kind: 'staff+residents' },
        title: 'Alarme de incêndio',
        body: place
            ? `Alarme acionado: ${place}. Siga as orientações de segurança.`
            : 'Alarme acionado na central de incêndio. Siga as orientações de segurança.',
        channel: 'cie_alarm',
        priority: 'high',
        // Um alarme que chega meia hora depois mais confunde do que ajuda.
        ttlSeconds: 30 * 60,
        collapseKey: 'cie-alarm',
        target: 'fire',
    });
};

const onRise = (flag: Flag) => {
    if (ABNORMAL_FLAGS.includes(flag)) abnormalNotified = true;
    switch (flag) {
        case 'alarm':
            sendAlarm();
            return;
        case 'failure': {
            const place = describePlace('falha');
            void notifySafely(staffNotice('cie.failure', 'Central de incêndio: falha',
                place ? `Falha registrada: ${place}.` : 'A central registrou uma falha. Verifique o painel.', 'cie_status'));
            return;
        }
        case 'supervision': {
            const place = describePlace('supervisao');
            void notifySafely(staffNotice('cie.supervision', 'Central de incêndio: supervisão',
                place ? `Supervisão registrada: ${place}.` : 'A central registrou um evento de supervisão.', 'cie_status'));
            return;
        }
        case 'blocked':
            void notifySafely(staffNotice('cie.blocked', 'Central de incêndio: bloqueio',
                'Há dispositivos bloqueados na central.', 'cie_info'));
            return;
        case 'restarting':
            void notifySafely(staffNotice('cie.restarting', 'Central de incêndio reiniciando',
                'A central está sendo reiniciada.', 'cie_status'));
            return;
        case 'offline':
            void notifySafely(staffNotice('cie.offline', 'Central de incêndio sem comunicação',
                `Sem contato com a central há mais de ${offlineMinutes()} minutos.`, 'cie_status'));
    }
};

const onFall = (flag: Flag) => {
    if (flag === 'alarm') {
        void notifySafely(staffNotice('cie.alarm.cleared', 'Alarme de incêndio encerrado',
            'A central não indica mais alarme ativo.', 'cie_status'));
    }
    const allClear = ['alarm', ...ABNORMAL_FLAGS].every((name) => !state(name as Flag).active);
    if (abnormalNotified && allClear && ABNORMAL_FLAGS.includes(flag)) {
        abnormalNotified = false;
        void notifySafely(staffNotice('cie.normalized', 'Central de incêndio normalizada',
            'A central voltou ao estado normal.', 'cie_info'));
    }
};

const evaluate = () => {
    const now = Date.now();
    const offline = state('offline');
    offline.raw = !upstreamConnected || !panelConnected;

    // "Sem contato" vale desde a subida da API, mesmo sem nenhum estado recebido.
    // Sem contato, os contadores são os últimos conhecidos: não confirmar descida nem subida com eles.
    const names: Flag[] = !ready
        ? ['offline']
        : offline.active ? ['restarting', 'offline'] : [...COUNTER_FLAGS, 'restarting', 'offline'];
    for (const name of names) {
        const edge = settle(name, now);
        if (edge === 'rise') onRise(name);
        if (edge === 'fall') onFall(name);
    }
};

type StatusSnapshot = {
    connected?: boolean;
    restartingUntil?: number | null;
    status?: { status?: Record<string, unknown> } | null;
};

const count = (status: Record<string, unknown> | undefined, key: string) => Number(status?.[key] ?? 0) > 0;

/** Primeiro estado depois de subir: vira a base, sem avisos, exceto o alarme (ver cabeçalho). */
const takeBaseline = async () => {
    for (const name of [...COUNTER_FLAGS, 'restarting'] as Flag[]) {
        const current = state(name);
        current.active = current.raw;
        current.pendingSince = null;
    }
    ready = true;
    if (!state('alarm').active) return;

    const last = await notificationRepository.lastDispatchAt('cie.alarm');
    if (!last || Date.now() - last.getTime() > ALARM_RESEND_WINDOW_MS) {
        logger.warn('[ApiV3 Push] Alarme de incêndio já ativo ao iniciar o monitor; enviando aviso.');
        sendAlarm();
    }
};

let baselinePending = false;

const onStatus = (snapshot: StatusSnapshot) => {
    const counters = snapshot.status?.status;
    if (typeof snapshot.connected === 'boolean') panelConnected = snapshot.connected;
    if (counters) {
        state('alarm').raw = count(counters, 'alarme');
        state('failure').raw = count(counters, 'falha');
        state('supervision').raw = count(counters, 'supervisao');
        state('blocked').raw = count(counters, 'bloqueio');
    }
    state('restarting').raw = typeof snapshot.restartingUntil === 'number' && snapshot.restartingUntil > Date.now();

    if (!ready) {
        if (!counters || baselinePending) return;
        baselinePending = true;
        takeBaseline()
            .catch((error) => {
                ready = true;
                logger.error('[ApiV3 Push] Falha ao conferir alarme anterior; enviando por segurança:', error);
                if (state('alarm').active) sendAlarm();
            })
            .finally(() => { baselinePending = false; });
        return;
    }
    evaluate();
};

/** Liga o monitor aos eventos do nova-cie repassados pelo gateway do WebSocket. */
export const startCieNotifications = (): void => {
    if (!process.env.CIE_SERVICE_TOKEN) {
        logger.warn('[ApiV3 Push] CIE_SERVICE_TOKEN ausente — avisos da central desativados.');
        return;
    }

    cieUpstreamEvents.on('event', ({ event, data }: { event: string; data: unknown }) => {
        try {
            if (event === 'cie.status.updated') {
                onStatus((data ?? {}) as StatusSnapshot);
            } else if (event === 'cie.active.updated') {
                const update = data as { type?: string; items?: unknown[] };
                if (update?.type) activeItems.set(update.type, Array.isArray(update.items) ? update.items : []);
            } else if (event === 'cie.connection.changed') {
                panelConnected = (data as { connected?: boolean })?.connected === true;
                evaluate();
            }
        } catch (error) {
            // Listener síncrono do gateway: exceção aqui não pode derrubar o repasse aos clientes.
            logger.error('[ApiV3 Push] Falha ao processar evento da central:', error);
        }
    });

    cieUpstreamEvents.on('connection', (connected: boolean) => {
        upstreamConnected = connected;
        try {
            evaluate();
        } catch (error) {
            logger.error('[ApiV3 Push] Falha ao processar conexão com a central:', error);
        }
    });

    // Confirma descidas e o "sem contato" mesmo quando não chegam eventos.
    setInterval(() => {
        try {
            evaluate();
        } catch (error) {
            logger.error('[ApiV3 Push] Falha no laço de avisos da central:', error);
        }
    }, TICK_MS).unref();
};
