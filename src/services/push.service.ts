import webpush, { WebPushError } from 'web-push';
import {
    listAllPushSubscriptions,
    removeEndpointFromAllPushSubscriptions,
    type StoredPushSubscription,
} from '../repositories/push-subscription.repository';

export type FireAlarmEventPayload = {
    source?: string;
    triggeredAt?: string;
    counters?: {
        alarme?: number;
        falha?: number;
        supervisao?: number;
        bloqueio?: number;
    };
    latestAlarmLogs?: unknown[];
};

export type PushDispatchSummary = {
    totalSubscriptions: number;
    sent: number;
    failed: number;
    removedInvalid: number;
};

const VAPID_PUBLIC_KEY = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = String(process.env.WEB_PUSH_VAPID_SUBJECT || '').trim();

let configured = false;

const ensureWebPushConfigured = (): void => {
    if (configured) return;

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
        throw new Error('Web Push nao configurado. Defina WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY e WEB_PUSH_VAPID_SUBJECT.');
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
};

export const getPublicPushKey = (): string => {
    if (!VAPID_PUBLIC_KEY) {
        throw new Error('WEB_PUSH_VAPID_PUBLIC_KEY nao configurada.');
    }
    return VAPID_PUBLIC_KEY;
};

const toNotificationPayload = (eventPayload?: FireAlarmEventPayload): Record<string, unknown> => {
    const triggeredAt = eventPayload?.triggeredAt || new Date().toISOString();
    const counters = {
        alarme: Number(eventPayload?.counters?.alarme || 0),
        falha: Number(eventPayload?.counters?.falha || 0),
        supervisao: Number(eventPayload?.counters?.supervisao || 0),
        bloqueio: Number(eventPayload?.counters?.bloqueio || 0),
    };

    const body = counters.alarme > 0
        ? `Alarme ativo (${counters.alarme}). Acesse a central imediatamente.`
        : 'Evento de alarme recebido da central.';

    return {
        title: 'Alarme de Incendio',
        body,
        tag: 'fire-alarm',
        renotify: true,
        requireInteraction: true,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: {
            url: '/dashboard/central-incendio',
            source: eventPayload?.source || 'CIE2500',
            triggeredAt,
            counters,
        },
    };
};

const isInvalidEndpointError = (error: unknown): boolean => {
    const statusCode = (error as WebPushError)?.statusCode;
    return statusCode === 404 || statusCode === 410;
};

const toWebPushSubscription = (stored: StoredPushSubscription) => ({
    endpoint: stored.endpoint,
    expirationTime: stored.expirationTime,
    keys: stored.keys,
});

export const sendFireAlarmPushToAll = async (eventPayload?: FireAlarmEventPayload): Promise<PushDispatchSummary> => {
    ensureWebPushConfigured();

    const subscriptions = await listAllPushSubscriptions();
    if (subscriptions.length === 0) {
        return {
            totalSubscriptions: 0,
            sent: 0,
            failed: 0,
            removedInvalid: 0,
        };
    }

    const payload = JSON.stringify(toNotificationPayload(eventPayload));

    let sent = 0;
    let failed = 0;
    let removedInvalid = 0;

    await Promise.all(subscriptions.map(async ({ subscription }) => {
        try {
            await webpush.sendNotification(toWebPushSubscription(subscription), payload);
            sent += 1;
        } catch (error) {
            failed += 1;
            if (isInvalidEndpointError(error)) {
                removedInvalid += await removeEndpointFromAllPushSubscriptions(subscription.endpoint);
            }
        }
    }));

    return {
        totalSubscriptions: subscriptions.length,
        sent,
        failed,
        removedInvalid,
    };
};
