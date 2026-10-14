import logger from '../../core/utils/logger';
import { getExhaustMemory } from '../../core/services/exhaust.service';
import * as notificationRepository from '../../core/repositories/notification.repository';
import { notifySafely } from '../notification/notification.service';

// =============================================================================
// Avisos do exaustor no app: "faltam X minutos" e "desligado".
//
// Regra do último acionamento (decisão de 13/10/2026): cada exaustor tem um
// único dono do ciclo atual, a conta do último ligar/reiniciar feito pelo
// app. Ex.: A liga às 10h, B reinicia às 12h, C reinicia duas vezes e o
// exaustor desliga às 20h → só C recebe os avisos; A e B deixam de receber
// assim que são substituídos.
//
// O registro guarda o expiresAt do ciclo. Se o expiresAt atual for outro, o
// tempo foi mudado por fora do app (painel v2) e ninguém recebe: não se sabe
// quem está usando a churrasqueira. Quando o exaustor desliga, o registro é
// apagado; um acionamento futuro nunca herda o dono anterior.
//
// Lê só a memória do core (sem tocar no módulo físico) a cada 20 s.
// =============================================================================

const TICK_MS = 20_000;
const ALL_EXHAUST_IDS = [...'ABC'].flatMap((tower) => [1, 2, 3, 4, 5, 6, 7, 8].map((final) => `${tower}${final}`));

// Lida dentro da função: imports resolvem antes do dotenv.config().
export const exhaustExpiringMinutes = (): number => {
    const value = Number(process.env.NOTIFY_EXHAUST_EXPIRING_MINUTES);
    return Number.isInteger(value) && value > 0 ? value : 15;
};

const sameCycle = (recorded: Date | null, expiresAt: number | null) =>
    recorded === null ? expiresAt === null : expiresAt !== null && recorded.getTime() === expiresAt;

/** Chamado depois de um /on bem-sucedido: quem ligou ou reiniciou passa a ser o dono do ciclo. */
export const recordExhaustActivation = async (exhaustId: string, accountId: string): Promise<void> => {
    try {
        const expiresAt = getExhaustMemory(exhaustId)?.expiresAt ?? null;
        await notificationRepository.upsertExhaustActivation(exhaustId, accountId, expiresAt === null ? null : new Date(expiresAt));
    } catch (error) {
        // Sem o registro o dono só deixa de receber os avisos; o comando já foi executado.
        logger.error(`[ApiV3 Push] Falha ao registrar o acionamento do exaustor ${exhaustId}:`, error);
    }
};

/** Chamado depois de um /off pelo app: se foi o próprio dono, não há o que avisar. */
export const recordExhaustTurnedOff = async (exhaustId: string, accountId: string): Promise<void> => {
    try {
        await notificationRepository.deleteExhaustActivation(exhaustId, accountId);
    } catch (error) {
        logger.error(`[ApiV3 Push] Falha ao encerrar o ciclo do exaustor ${exhaustId}:`, error);
    }
};

type Phase = 'on' | 'off' | 'off-error' | 'transition';

const phaseOf = (exhaustId: string): { phase: Phase; expiresAt: number | null } => {
    const memory = getExhaustMemory(exhaustId);
    // O core apaga a memória quando o desligamento é confirmado.
    if (!memory) return { phase: 'off', expiresAt: null };
    if (memory.pendingCommand === 'ligar' && memory.processStatus === 'executado') return { phase: 'on', expiresAt: memory.expiresAt };
    if (memory.pendingCommand === 'desligar' && memory.processStatus === 'erro') return { phase: 'off-error', expiresAt: memory.expiresAt };
    return { phase: 'transition', expiresAt: memory.expiresAt };
};

/** expiresAt do ciclo de cada exaustor visto ligado, até o desligamento ser confirmado. */
const cycles = new Map<string, number | null>();
// Evita uma consulta ao banco por tick enquanto o exaustor está na janela do aviso.
const sentKeys = new Set<string>();

const notifyExpiring = async (exhaustId: string, expiresAt: number) => {
    const key = `exhaust.expiring:${exhaustId}:${expiresAt}`;
    if (sentKeys.has(key)) return;
    const activation = await notificationRepository.findExhaustActivation(exhaustId);
    sentKeys.add(key);
    if (!activation || !sameCycle(activation.expiresAt, expiresAt)) return;

    const remainingMs = expiresAt - Date.now();
    const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    await notifySafely({
        kind: 'exhaust.expiring',
        dedupeKey: key,
        audience: { kind: 'accounts', accountIds: [activation.accountId] },
        preference: 'exhaustExpiring',
        title: 'Exaustor da churrasqueira',
        body: `Faltam ${minutes} minuto${minutes === 1 ? '' : 's'} para o exaustor ${exhaustId} desligar. `
            + 'Se ainda estiver usando, reinicie o tempo no app.',
        channel: 'exhaust',
        // Precisa chegar no horário mesmo com o aparelho em economia de bateria.
        priority: 'high',
        ttlSeconds: remainingMs / 1000,
        collapseKey: `exhaust:${exhaustId}`,
        target: 'exhaust',
        extra: { exhaustId },
    });
};

const notifyOff = async (exhaustId: string, cycleExpiresAt: number | null, confirmed: boolean) => {
    const kind = confirmed ? 'exhaust.off' : 'exhaust.off.unconfirmed';
    const cycleKey = `${kind}:${exhaustId}:${cycleExpiresAt ?? 'sem-prazo'}`;
    if (sentKeys.has(cycleKey)) return;
    sentKeys.add(cycleKey);

    const activation = await notificationRepository.findExhaustActivation(exhaustId);
    if (!activation || !sameCycle(activation.expiresAt, cycleExpiresAt)) return;

    await notifySafely({
        kind,
        dedupeKey: `${cycleKey}:${activation.accountId}`,
        audience: { kind: 'accounts', accountIds: [activation.accountId] },
        preference: 'exhaustOff',
        title: confirmed ? 'Exaustor desligado' : 'Não foi possível confirmar o desligamento',
        body: confirmed
            ? `O exaustor ${exhaustId} foi desligado.`
            : `Exaustor ${exhaustId}: atualize o estado antes de tentar novamente.`,
        channel: 'exhaust',
        priority: 'normal',
        ttlSeconds: 60 * 60,
        collapseKey: `exhaust:${exhaustId}`,
        target: 'exhaust',
        extra: { exhaustId },
    });
};

const tick = async () => {
    const windowMs = exhaustExpiringMinutes() * 60_000;
    const now = Date.now();

    for (const exhaustId of ALL_EXHAUST_IDS) {
        const { phase, expiresAt } = phaseOf(exhaustId);

        if (phase === 'on') {
            cycles.set(exhaustId, expiresAt);
            if (expiresAt !== null && expiresAt - now <= windowMs && expiresAt > now) {
                await notifyExpiring(exhaustId, expiresAt);
            }
        } else if (phase === 'off-error' && cycles.has(exhaustId)) {
            // Mantém o ciclo: se a nova tentativa do core desligar, o "desligado" ainda sai.
            await notifyOff(exhaustId, cycles.get(exhaustId) ?? null, false);
        } else if (phase === 'off' && cycles.has(exhaustId)) {
            const cycleExpiresAt = cycles.get(exhaustId) ?? null;
            cycles.delete(exhaustId);
            await notifyOff(exhaustId, cycleExpiresAt, true);
            await notificationRepository.deleteExhaustActivation(exhaustId);
        }
    }

    if (sentKeys.size > 500) sentKeys.clear();
};

/**
 * Remove registros de exaustores que já estão desligados (desligaram com a
 * API parada): o ciclo acabou e não deve ser herdado.
 */
const dropFinishedCycles = async () => {
    for (const activation of await notificationRepository.listExhaustActivations()) {
        if (phaseOf(activation.exhaustId).phase === 'off') {
            await notificationRepository.deleteExhaustActivation(activation.exhaustId);
        }
    }
};

/** Sobe o laço dos avisos do exaustor. Depende da memória do core já carregada (startExhaustService). */
export const startExhaustNotifications = (): void => {
    let running = false;
    const run = async () => {
        if (running) return;
        running = true;
        try {
            await tick();
        } catch (error) {
            logger.error('[ApiV3 Push] Falha no laço de avisos do exaustor:', error);
        } finally {
            running = false;
        }
    };

    dropFinishedCycles()
        .catch((error) => logger.error('[ApiV3 Push] Falha ao limpar ciclos de exaustor encerrados:', error))
        .finally(() => {
            void run();
            setInterval(() => void run(), TICK_MS).unref();
        });
};
