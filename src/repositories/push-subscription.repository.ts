import { pool } from '../utils/db';

export type PushSubscriptionKeys = {
    p256dh: string;
    auth: string;
};

export type PushSubscriptionInput = {
    endpoint: string;
    expirationTime?: number | null;
    keys: PushSubscriptionKeys;
};

export type PushSubscriptionMeta = {
    ua?: string | null;
    platform?: string | null;
};

export type StoredPushSubscription = {
    endpoint: string;
    expirationTime: number | null;
    keys: PushSubscriptionKeys;
    createdAt: number;
    updatedAt: number;
    ua: string | null;
    platform: string | null;
};

export type UserPushSubscriptionsData = {
    user: string;
    updatedAt: number;
    items: StoredPushSubscription[];
};

type PushSubscriptionRow = {
    user_id: string;
    endpoint: string;
    expiration_time: string | null;
    p256dh: string;
    auth: string;
    ua: string | null;
    platform: string | null;
    created_at: Date;
    updated_at: Date;
};

const rowToSubscription = (row: PushSubscriptionRow): StoredPushSubscription => ({
    endpoint: row.endpoint,
    expirationTime: row.expiration_time !== null ? Number(row.expiration_time) : null,
    keys: { p256dh: row.p256dh, auth: row.auth },
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
    ua: row.ua,
    platform: row.platform,
});

const readUserSubscriptions = async (user: string): Promise<UserPushSubscriptionsData> => {
    const result = await pool.query<PushSubscriptionRow>(
        'SELECT * FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at',
        [user],
    );

    const items = result.rows.map(rowToSubscription);
    const updatedAt = items.reduce((max, item) => Math.max(max, item.updatedAt), 0);

    return { user, updatedAt, items };
};

export const upsertPushSubscription = async (
    user: string,
    subscription: PushSubscriptionInput,
    meta?: PushSubscriptionMeta,
): Promise<UserPushSubscriptionsData> => {
    const expirationTime = typeof subscription.expirationTime === 'number' && Number.isFinite(subscription.expirationTime)
        ? Math.trunc(subscription.expirationTime)
        : null;

    await pool.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, expiration_time, p256dh, auth, ua, platform)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (endpoint) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            expiration_time = EXCLUDED.expiration_time,
            p256dh = EXCLUDED.p256dh,
            auth = EXCLUDED.auth,
            ua = COALESCE(EXCLUDED.ua, push_subscriptions.ua),
            platform = COALESCE(EXCLUDED.platform, push_subscriptions.platform),
            updated_at = now()`,
        [
            user,
            subscription.endpoint,
            expirationTime,
            subscription.keys.p256dh,
            subscription.keys.auth,
            typeof meta?.ua === 'string' && meta.ua.trim() ? meta.ua.trim() : null,
            typeof meta?.platform === 'string' && meta.platform.trim() ? meta.platform.trim() : null,
        ],
    );

    return readUserSubscriptions(user);
};

export const removePushSubscriptionByEndpoint = async (
    user: string,
    endpoint: string,
): Promise<{ data: UserPushSubscriptionsData; removed: boolean }> => {
    const result = await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [user, endpoint]);
    const removed = (result.rowCount ?? 0) > 0;
    const data = await readUserSubscriptions(user);
    return { data, removed };
};

export const listAllPushSubscriptions = async (): Promise<Array<{ user: string; subscription: StoredPushSubscription }>> => {
    const result = await pool.query<PushSubscriptionRow>('SELECT * FROM push_subscriptions ORDER BY user_id, created_at');
    return result.rows.map((row) => ({ user: row.user_id, subscription: rowToSubscription(row) }));
};

export const removeEndpointFromAllPushSubscriptions = async (endpoint: string): Promise<number> => {
    const result = await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    return result.rowCount ?? 0;
};
