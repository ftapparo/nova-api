import { Request, Response } from 'express';
import {
    removePushSubscriptionByEndpoint,
    upsertPushSubscription,
    type PushSubscriptionInput,
} from '../repositories/push-subscription.repository';
import {
    getPublicPushKey,
    sendFireAlarmPushToAll,
    type FireAlarmEventPayload,
} from '../services/push.service';

const FIRE_ALARM_COOLDOWN_MS = Number(process.env.PUSH_FIRE_ALARM_COOLDOWN_MS || 60000);
let lastFireAlarmSentAt = 0;

const normalizeUser = (value: unknown): string => String(value ?? '').trim().toUpperCase();

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};

const parseSubscription = (value: unknown): PushSubscriptionInput | null => {
    if (!isPlainObject(value)) return null;

    const endpoint = typeof value.endpoint === 'string' ? value.endpoint.trim() : '';
    if (!endpoint) return null;

    const keys = isPlainObject(value.keys) ? value.keys : null;
    const p256dh = typeof keys?.p256dh === 'string' ? keys.p256dh.trim() : '';
    const auth = typeof keys?.auth === 'string' ? keys.auth.trim() : '';

    if (!p256dh || !auth) return null;

    const expirationTime = typeof value.expirationTime === 'number' && Number.isFinite(value.expirationTime)
        ? Math.trunc(value.expirationTime)
        : null;

    return {
        endpoint,
        expirationTime,
        keys: { p256dh, auth },
    };
};

const parseCooldown = (): number => {
    if (!Number.isFinite(FIRE_ALARM_COOLDOWN_MS) || FIRE_ALARM_COOLDOWN_MS < 0) {
        return 60000;
    }
    return Math.trunc(FIRE_ALARM_COOLDOWN_MS);
};

export const pushPublicKeyController = (_req: Request, res: Response): void => {
    try {
        const publicKey = getPublicPushKey();
        res.ok({ publicKey });
    } catch (error: any) {
        res.fail(error?.message || 'Falha ao carregar chave publica de push.', 500);
    }
};

export const pushSubscribeController = async (req: Request, res: Response): Promise<void> => {
    const user = normalizeUser(req.body?.user || req.actor || req.headers['x-user']);
    if (!user) {
        res.fail('Usuario e obrigatorio.', 400);
        return;
    }

    const subscription = parseSubscription(req.body?.subscription);
    if (!subscription) {
        res.fail('Campo "subscription" invalido.', 400);
        return;
    }

    const meta = {
        ua: typeof req.body?.meta?.ua === 'string' ? req.body.meta.ua : (typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null),
        platform: typeof req.body?.meta?.platform === 'string' ? req.body.meta.platform : 'web',
    };

    try {
        const data = await upsertPushSubscription(user, subscription, meta);
        res.ok({
            user: data.user,
            updatedAt: data.updatedAt,
            totalSubscriptions: data.items.length,
        });
    } catch (error: any) {
        console.error('[PushController] Falha ao salvar subscription:', error?.message || error);
        res.fail('Falha ao salvar subscription de push.', 500, error?.message || error);
    }
};

export const pushUnsubscribeController = async (req: Request, res: Response): Promise<void> => {
    const user = normalizeUser(req.body?.user || req.actor || req.headers['x-user']);
    if (!user) {
        res.fail('Usuario e obrigatorio.', 400);
        return;
    }

    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : '';
    if (!endpoint) {
        res.fail('Campo "endpoint" e obrigatorio.', 400);
        return;
    }

    try {
        const result = await removePushSubscriptionByEndpoint(user, endpoint);
        res.ok({
            user: result.data.user,
            updatedAt: result.data.updatedAt,
            totalSubscriptions: result.data.items.length,
            removed: result.removed,
        });
    } catch (error: any) {
        console.error('[PushController] Falha ao remover subscription:', error?.message || error);
        res.fail('Falha ao remover subscription de push.', 500, error?.message || error);
    }
};

export const pushFireAlarmEventController = async (req: Request, res: Response): Promise<void> => {
    const now = Date.now();
    const cooldownMs = parseCooldown();
    const elapsedMs = now - lastFireAlarmSentAt;

    if (lastFireAlarmSentAt > 0 && elapsedMs < cooldownMs) {
        res.ok({
            skipped: true,
            reason: 'cooldown',
            cooldownMs,
            elapsedMs,
            nextAllowedAt: lastFireAlarmSentAt + cooldownMs,
        });
        return;
    }

    try {
        const payload: FireAlarmEventPayload = isPlainObject(req.body)
            ? {
                source: typeof req.body.source === 'string' ? req.body.source : 'CIE2500',
                triggeredAt: typeof req.body.triggeredAt === 'string' ? req.body.triggeredAt : new Date().toISOString(),
                counters: isPlainObject(req.body.counters) ? req.body.counters as FireAlarmEventPayload['counters'] : undefined,
                latestAlarmLogs: Array.isArray(req.body.latestAlarmLogs) ? req.body.latestAlarmLogs : undefined,
            }
            : {
                source: 'CIE2500',
                triggeredAt: new Date().toISOString(),
            };

        const dispatch = await sendFireAlarmPushToAll(payload);
        lastFireAlarmSentAt = now;

        res.ok({
            skipped: false,
            cooldownMs,
            sentAt: now,
            dispatch,
        });
    } catch (error: any) {
        console.error('[PushController] Falha ao enviar push de alarme:', error?.message || error);
        res.fail(error?.message || 'Falha ao enviar push de alarme.', 500, error?.message || error);
    }
};
