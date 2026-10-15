import logger from '../../core/utils/logger';
import * as notificationRepository from '../../core/repositories/notification.repository';
import type { DeviceAudience, PreferenceKey } from '../../core/repositories/notification.repository';
import { getResidence } from '../residence/residence.service';
import { sendAndroid } from './fcm.sender';
import { toLang, type Lang } from '../shared/i18n';

// =============================================================================
// Envio de avisos do app. Cada aviso lógico tem uma dedupe_key: o mesmo aviso
// nunca sai duas vezes, nem depois de reiniciar a API. Quem decide o público
// é a API, pelo papel e pela foto de "morador ativo" de cada aparelho:
//   staff            porteiro, síndico e admin
//   staff+residents  equipe + morador com unidade liberada
//   residents        morador com unidade liberada que não é da equipe
//   accounts         contas específicas (ex.: dono do ciclo do exaustor)
// =============================================================================

/** Tipos de aviso (campo `type` do payload). Fechado: o app decide o visual por ele. */
export type NotificationKind =
    | 'cie.alarm'
    | 'cie.alarm.cleared'
    | 'cie.alarm.resolved'
    | 'cie.failure'
    | 'cie.supervision'
    | 'cie.blocked'
    | 'cie.restarting'
    | 'cie.offline'
    | 'cie.normalized'
    | 'exhaust.expiring'
    | 'exhaust.off'
    | 'exhaust.off.unconfirmed'
    | 'message.published'
    | 'test';

/** Canais de notificação do app Android (criados pelo app com estes ids). */
export type NotificationChannel = 'cie_alarm' | 'cie_status' | 'cie_info' | 'exhaust' | 'messages' | 'general';

/** Tela que o toque na notificação abre. */
export type NotificationTarget = 'fire' | 'exhaust' | 'message' | 'home';

export type AppNotification = {
    kind: NotificationKind;
    dedupeKey: string;
    audience: DeviceAudience;
    /** Preferência da conta que pode bloquear este aviso; ausente = sempre enviado. */
    preference?: PreferenceKey;
    /** Título e corpo no idioma de cada aparelho (gravado no registro do app). */
    text: (lang: Lang) => { title: string; body: string };
    channel: NotificationChannel;
    priority: 'high' | 'normal';
    ttlSeconds: number;
    collapseKey: string;
    target: NotificationTarget;
    /** Campos extras do payload (ex.: exhaustId, messageId), sempre texto. */
    extra?: Record<string, string>;
    /**
     * Tipo gravado no histórico de envios quando difere do payload. O teste do
     * alarme sai como cie.alarm para o app tratá-lo igual ao real, mas não pode
     * contar como alarme enviado (ver lastDispatchAt em cie.notifications.ts).
     */
    dispatchKind?: string;
};

export type DispatchResult = { dispatchId: number; targets: number; success: number; failure: number };

const describeAudience = (audience: DeviceAudience) => {
    if (audience.kind === 'accounts') return `accounts:${audience.accountIds.length}`;
    if (audience.kind === 'device') return `device:${audience.installationId}`;
    return audience.kind;
};

/**
 * Envia o aviso aos aparelhos do público. Devolve null se esse aviso já foi
 * enviado antes (mesma dedupe_key). Nunca lança por falha do FCM; falha do
 * banco sobe para quem chamou.
 */
export const notify = async (notification: AppNotification): Promise<DispatchResult | null> => {
    const dispatchId = await notificationRepository.claimDispatch(
        notification.dispatchKind ?? notification.kind,
        notification.dedupeKey,
        describeAudience(notification.audience),
    );
    if (dispatchId === null) return null;

    const targets = await notificationRepository.listDeviceTargets(notification.audience, notification.preference);
    // Um envio por idioma: o mesmo aviso sai com o texto de cada grupo de aparelhos.
    const byLang = new Map<Lang, string[]>();
    for (const target of targets) {
        const lang = toLang(target.language);
        byLang.set(lang, [...(byLang.get(lang) ?? []), target.token]);
    }
    const sentAt = new Date().toISOString();
    const result = { success: 0, failure: 0, invalidTokens: [] as string[] };
    for (const [lang, tokens] of byLang) {
        const { title, body } = notification.text(lang);
        const sent = await sendAndroid(tokens, {
            data: {
                type: notification.kind,
                title,
                body,
                channel: notification.channel,
                target: notification.target,
                sentAt,
                dispatchId: String(dispatchId),
                ...notification.extra,
            },
            priority: notification.priority,
            ttlSeconds: Math.max(0, Math.round(notification.ttlSeconds)),
            collapseKey: notification.collapseKey,
        });
        result.success += sent.success;
        result.failure += sent.failure;
        result.invalidTokens.push(...sent.invalidTokens);
    }

    await notificationRepository.invalidateTokens(result.invalidTokens);
    await notificationRepository.finishDispatch(dispatchId, {
        target: targets.length,
        success: result.success,
        failure: result.failure,
    });
    logger.info(
        `[ApiV3 Push] ${notification.kind} (${notification.dedupeKey}): ${targets.length} aparelho(s), `
        + `${result.success} ok, ${result.failure} falha(s), ${result.invalidTokens.length} token(s) inválido(s)`,
    );
    return { dispatchId, targets: targets.length, success: result.success, failure: result.failure };
};

/** Versão para laços de fundo: registra a falha em vez de propagar. */
export const notifySafely = async (notification: AppNotification): Promise<DispatchResult | null> => {
    try {
        return await notify(notification);
    } catch (error) {
        logger.error(`[ApiV3 Push] Falha ao enviar ${notification.kind} (${notification.dedupeKey}):`, error);
        return null;
    }
};

/** "Morador ativo" desta conta agora, ou null se o Firebird não respondeu. */
export const resolveResidentActive = async (accountId: string): Promise<boolean | null> => {
    try {
        return !(await getResidence(accountId)).blocked;
    } catch (error) {
        logger.warn(`[ApiV3 Push] Não foi possível conferir a residência de ${accountId}:`, error);
        return null;
    }
};

const AUDIENCE_MAX_AGE_MS = 30 * 60_000;

/**
 * Renova a foto de "morador ativo" dos aparelhos, para que bloqueio ou
 * desvínculo feito pela equipe valha também para o push (getResidence tem
 * cache de 2 min por pessoa). O papel da equipe é renovado a cada registro
 * do app, que ocorre pelo menos uma vez por dia.
 */
export const refreshAudiences = async (): Promise<void> => {
    const accountIds = await notificationRepository.listAccountsWithStaleAudience(AUDIENCE_MAX_AGE_MS);
    for (const accountId of accountIds) {
        const residentActive = await resolveResidentActive(accountId);
        if (residentActive !== null) await notificationRepository.updateResidentActive(accountId, residentActive);
    }
};
