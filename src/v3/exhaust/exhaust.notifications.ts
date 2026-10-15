import logger from '../../core/utils/logger';
import { exhaustEvents, getExhaustMemory } from '../../core/services/exhaust.service';
import { demoExhaustEvents, getDemoMemory, isDemoExhaust, listDemoExhaustIds } from './exhaust.demo';
import * as notificationRepository from '../../core/repositories/notification.repository';
import { notifySafely } from '../notification/notification.service';
import { pick, type Lang } from '../shared/i18n';

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
// Lê só a memória do core (sem tocar no módulo físico): 1 s depois de cada
// mudança dela e, por garantia, a cada 20 s (o "faltam X minutos" depende do relógio).
// =============================================================================

const TICK_MS = 20_000;
const ALL_EXHAUST_IDS = [...'ABC'].flatMap((tower) => [1, 2, 3, 4, 5, 6, 7, 8].map((final) => `${tower}${final}`));

// O exaustor simulado da conta de revisão (exhaust.demo.ts) gera os mesmos avisos que o real.
const memoryOf = (exhaustId: string) => (isDemoExhaust(exhaustId) ? getDemoMemory(exhaustId) : getExhaustMemory(exhaustId));
const watchedIds = () => [...ALL_EXHAUST_IDS, ...listDemoExhaustIds()];

// Lida dentro da função: imports resolvem antes do dotenv.config().
export const exhaustExpiringMinutes = (): number => {
    const value = Number(process.env.NOTIFY_EXHAUST_EXPIRING_MINUTES);
    return Number.isInteger(value) && value > 0 ? value : 15;
};

/**
 * "Torre A, final 4". O id "A4" confunde com o apartamento A-4 (o exaustor atende a prumada inteira:
 * A-114, A-124…), e o app não mostra esse id em lugar nenhum.
 */
export const describeExhaust = (exhaustId: string, lang: Lang = 'pt-BR') => {
    const tower = exhaustId.slice(0, -1);
    const final = exhaustId.slice(-1);
    return pick(lang, `Torre ${tower}, final ${final}`, { en: `Tower ${tower}, line ${final}`, es: `Torre ${tower}, final ${final}` });
};

const sameCycle = (recorded: Date | null, expiresAt: number | null) =>
    recorded === null ? expiresAt === null : expiresAt !== null && recorded.getTime() === expiresAt;

/** Chamado depois de um /on bem-sucedido: quem ligou ou reiniciou passa a ser o dono do ciclo. */
export const recordExhaustActivation = async (exhaustId: string, accountId: string): Promise<void> => {
    try {
        const expiresAt = memoryOf(exhaustId)?.expiresAt ?? null;
        await notificationRepository.upsertExhaustActivation(exhaustId, accountId, expiresAt === null ? null : new Date(expiresAt));
    } catch (error) {
        // Sem o registro o dono só deixa de receber os avisos; o comando já foi executado.
        logger.error(`[ApiV3 Push] Falha ao registrar o acionamento do exaustor ${exhaustId}:`, error);
    }
};

/** Chamado antes de um /off pelo app: se é o próprio dono, não há o que avisar. */
export const recordExhaustTurnedOff = async (exhaustId: string, accountId: string): Promise<void> => {
    try {
        await notificationRepository.deleteExhaustActivation(exhaustId, accountId);
    } catch (error) {
        logger.error(`[ApiV3 Push] Falha ao encerrar o ciclo do exaustor ${exhaustId}:`, error);
    }
};

type Phase = 'on' | 'off' | 'off-error' | 'transition';

const phaseOf = (exhaustId: string): { phase: Phase; expiresAt: number | null } => {
    const memory = memoryOf(exhaustId);
    // O core apaga a memória quando o desligamento é confirmado.
    if (!memory) return { phase: 'off', expiresAt: null };
    if (memory.pendingCommand === 'ligar' && memory.processStatus === 'executado') return { phase: 'on', expiresAt: memory.expiresAt };
    if (memory.pendingCommand === 'desligar' && memory.processStatus === 'erro') return { phase: 'off-error', expiresAt: memory.expiresAt };
    return { phase: 'transition', expiresAt: memory.expiresAt };
};

// Evita repetir o mesmo aviso a cada passada (a dedupe_key no banco segura reinícios da API).
const sentKeys = new Set<string>();

const notifyExpiring = async (exhaustId: string, expiresAt: number, accountId: string) => {
    const key = `exhaust.expiring:${exhaustId}:${expiresAt}`;
    if (sentKeys.has(key)) return;
    sentKeys.add(key);

    const remainingMs = expiresAt - Date.now();
    const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    await notifySafely({
        kind: 'exhaust.expiring',
        dedupeKey: key,
        audience: { kind: 'accounts', accountIds: [accountId] },
        preference: 'exhaustExpiring',
        text: (lang) => ({
            title: pick(lang, 'Exaustor da churrasqueira', { en: 'Barbecue exhaust fan', es: 'Extractor de la parrilla' }),
            body: pick(lang,
                `Faltam ${minutes} minuto${minutes === 1 ? '' : 's'} para desligar o exaustor da ${describeExhaust(exhaustId)}. `
                    + 'Se ainda estiver usando, reinicie o tempo no app.', {
                    en: `The exhaust fan (${describeExhaust(exhaustId, lang)}) turns off in ${minutes} minute${minutes === 1 ? '' : 's'}. `
                        + 'If you are still using it, restart the timer in the app.',
                    es: `Falta${minutes === 1 ? '' : 'n'} ${minutes} minuto${minutes === 1 ? '' : 's'} para que se apague el extractor (${describeExhaust(exhaustId, lang)}). `
                        + 'Si todavía lo está usando, reinicie el tiempo en la app.',
                }),
        }),
        channel: 'exhaust',
        // Precisa chegar no horário mesmo com o aparelho em economia de bateria.
        priority: 'high',
        ttlSeconds: remainingMs / 1000,
        collapseKey: `exhaust:${exhaustId}`,
        target: 'exhaust',
        extra: { exhaustId },
    });
};

const notifyOff = async (activation: notificationRepository.ExhaustActivation, confirmed: boolean) => {
    const { exhaustId, accountId } = activation;
    const kind = confirmed ? 'exhaust.off' : 'exhaust.off.unconfirmed';
    const key = `${kind}:${exhaustId}:${activation.expiresAt?.getTime() ?? 'sem-prazo'}:${accountId}`;
    if (sentKeys.has(key)) return;
    sentKeys.add(key);

    await notifySafely({
        kind,
        dedupeKey: key,
        audience: { kind: 'accounts', accountIds: [accountId] },
        preference: 'exhaustOff',
        text: (lang) => confirmed
            ? {
                title: pick(lang, 'Exaustor desligado', { en: 'Exhaust fan turned off', es: 'Extractor apagado' }),
                body: pick(lang, `O exaustor da ${describeExhaust(exhaustId)} foi desligado.`, {
                    en: `The exhaust fan (${describeExhaust(exhaustId, lang)}) has been turned off.`,
                    es: `El extractor (${describeExhaust(exhaustId, lang)}) se apagó.`,
                }),
            }
            : {
                title: pick(lang, 'Não foi possível confirmar o desligamento', {
                    en: 'Unable to confirm the shutdown', es: 'No fue posible confirmar el apagado',
                }),
                body: pick(lang, `Exaustor da ${describeExhaust(exhaustId)}: atualize o estado antes de tentar novamente.`, {
                    en: `Exhaust fan (${describeExhaust(exhaustId, lang)}): refresh the status before trying again.`,
                    es: `Extractor (${describeExhaust(exhaustId, lang)}): actualice el estado antes de intentarlo de nuevo.`,
                }),
            },
        channel: 'exhaust',
        priority: 'normal',
        ttlSeconds: 60 * 60,
        collapseKey: `exhaust:${exhaustId}`,
        target: 'exhaust',
        extra: { exhaustId },
    });
};

/**
 * Cada passada compara a memória do core com o registro do dono. O registro é
 * a fonte do ciclo: não depende de a passada ter visto o exaustor ligado, então
 * ligar e desligar em poucos segundos também avisa (visto em 14/10/2026).
 */
const tick = async () => {
    const windowMs = exhaustExpiringMinutes() * 60_000;
    const now = Date.now();
    const activations = new Map((await notificationRepository.listExhaustActivations()).map((item) => [item.exhaustId, item]));

    for (const exhaustId of watchedIds()) {
        const activation = activations.get(exhaustId);
        if (!activation) continue;
        const { phase, expiresAt } = phaseOf(exhaustId);

        if (phase === 'on') {
            if (!sameCycle(activation.expiresAt, expiresAt)) {
                // Tempo mudado por fora do app (painel v2): não se sabe quem está usando, ninguém recebe.
                // A condição no banco evita apagar um registro novo gravado por um /on concorrente.
                await notificationRepository.deleteExhaustActivation(exhaustId, activation.accountId, activation.expiresAt);
            } else if (expiresAt !== null && expiresAt - now <= windowMs && expiresAt > now) {
                await notifyExpiring(exhaustId, expiresAt, activation.accountId);
            }
        } else if (phase === 'off-error') {
            // Mantém o registro: se a nova tentativa do core desligar, o "desligado" ainda sai.
            await notifyOff(activation, false);
        } else if (phase === 'off') {
            await notifyOff(activation, true);
            await notificationRepository.deleteExhaustActivation(exhaustId, activation.accountId, activation.expiresAt);
        }
    }

    if (sentKeys.size > 500) sentKeys.clear();
};

/**
 * Remove registros de exaustores que já estão desligados (desligaram com a
 * API parada): o ciclo acabou e não deve ser herdado nem avisado agora.
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
    let again = false;
    const run = async () => {
        if (running) {
            again = true;
            return;
        }
        running = true;
        try {
            await tick();
        } catch (error) {
            logger.error('[ApiV3 Push] Falha no laço de avisos do exaustor:', error);
        } finally {
            running = false;
            if (again) {
                again = false;
                void run();
            }
        }
    };

    // Cada comando grava a memória várias vezes em sequência; uma passada 1 s depois da última basta.
    let pending: NodeJS.Timeout | null = null;
    const schedule = () => {
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => {
            pending = null;
            void run();
        }, 1_000);
    };

    dropFinishedCycles()
        .catch((error) => logger.error('[ApiV3 Push] Falha ao limpar ciclos de exaustor encerrados:', error))
        .finally(() => {
            void run();
            exhaustEvents.on('memory.changed', schedule);
            demoExhaustEvents.on('changed', schedule);
            setInterval(() => void run(), TICK_MS).unref();
        });
};
