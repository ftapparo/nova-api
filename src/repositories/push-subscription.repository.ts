import { promises as fs } from 'fs';
import path from 'path';

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

const PUSH_SUBSCRIPTIONS_DIR = path.resolve(
    process.env.PUSH_SUBSCRIPTIONS_DIR || path.join(process.cwd(), 'storage', 'push-subscriptions'),
);

let ensureDirPromise: Promise<unknown> | null = null;

const ensureDirectory = async (): Promise<void> => {
    if (!ensureDirPromise) {
        ensureDirPromise = fs.mkdir(PUSH_SUBSCRIPTIONS_DIR, { recursive: true });
    }
    await ensureDirPromise;
};

const sanitizeUserForFile = (user: string): string => user.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_');

const getFilePath = (user: string): string => path.join(PUSH_SUBSCRIPTIONS_DIR, `${sanitizeUserForFile(user)}.json`);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};

const normalizeItem = (value: unknown): StoredPushSubscription | null => {
    if (!isPlainObject(value)) return null;

    const endpoint = typeof value.endpoint === 'string' ? value.endpoint.trim() : '';
    const keysRaw = value.keys;
    if (!endpoint || !isPlainObject(keysRaw)) return null;

    const p256dh = typeof keysRaw.p256dh === 'string' ? keysRaw.p256dh.trim() : '';
    const auth = typeof keysRaw.auth === 'string' ? keysRaw.auth.trim() : '';
    if (!p256dh || !auth) return null;

    const createdAt = typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
        ? Math.trunc(value.createdAt)
        : Date.now();
    const updatedAt = typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? Math.trunc(value.updatedAt)
        : createdAt;

    const expirationTime = typeof value.expirationTime === 'number' && Number.isFinite(value.expirationTime)
        ? Math.trunc(value.expirationTime)
        : null;

    const ua = typeof value.ua === 'string' && value.ua.trim() ? value.ua.trim() : null;
    const platform = typeof value.platform === 'string' && value.platform.trim() ? value.platform.trim() : null;

    return {
        endpoint,
        expirationTime,
        keys: { p256dh, auth },
        createdAt,
        updatedAt,
        ua,
        platform,
    };
};

const normalizeStoredData = (user: string, value: unknown): UserPushSubscriptionsData => {
    if (!isPlainObject(value)) {
        return { user, updatedAt: 0, items: [] };
    }

    const updatedAt = typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? Math.trunc(value.updatedAt)
        : 0;

    const rawItems = Array.isArray(value.items) ? value.items : [];
    const dedup = new Map<string, StoredPushSubscription>();
    for (const raw of rawItems) {
        const item = normalizeItem(raw);
        if (!item) continue;
        dedup.set(item.endpoint, item);
    }

    return {
        user,
        updatedAt,
        items: Array.from(dedup.values()),
    };
};

const readFileData = async (user: string): Promise<UserPushSubscriptionsData> => {
    await ensureDirectory();
    const filePath = getFilePath(user);

    try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return normalizeStoredData(user, parsed);
    } catch (error: any) {
        if (error?.code === 'ENOENT') {
            return { user, updatedAt: 0, items: [] };
        }
        throw error;
    }
};

const writeFileData = async (user: string, data: UserPushSubscriptionsData): Promise<void> => {
    await ensureDirectory();
    const filePath = getFilePath(user);
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

export const upsertPushSubscription = async (
    user: string,
    subscription: PushSubscriptionInput,
    meta?: PushSubscriptionMeta,
): Promise<UserPushSubscriptionsData> => {
    const data = await readFileData(user);
    const now = Date.now();

    const current = data.items.find((item) => item.endpoint === subscription.endpoint);
    const next: StoredPushSubscription = {
        endpoint: subscription.endpoint,
        expirationTime: typeof subscription.expirationTime === 'number' && Number.isFinite(subscription.expirationTime)
            ? Math.trunc(subscription.expirationTime)
            : null,
        keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
        },
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        ua: typeof meta?.ua === 'string' && meta.ua.trim() ? meta.ua.trim() : (current?.ua ?? null),
        platform: typeof meta?.platform === 'string' && meta.platform.trim()
            ? meta.platform.trim()
            : (current?.platform ?? null),
    };

    const filtered = data.items.filter((item) => item.endpoint !== next.endpoint);
    filtered.push(next);

    const updated: UserPushSubscriptionsData = {
        user,
        updatedAt: now,
        items: filtered,
    };

    await writeFileData(user, updated);
    return updated;
};

export const removePushSubscriptionByEndpoint = async (
    user: string,
    endpoint: string,
): Promise<{ data: UserPushSubscriptionsData; removed: boolean }> => {
    const data = await readFileData(user);
    const before = data.items.length;
    const items = data.items.filter((item) => item.endpoint !== endpoint);
    const removed = before !== items.length;

    const updated: UserPushSubscriptionsData = {
        user,
        updatedAt: removed ? Date.now() : data.updatedAt,
        items,
    };

    if (removed) {
        await writeFileData(user, updated);
    }

    return { data: updated, removed };
};

export const listAllPushSubscriptions = async (): Promise<Array<{ user: string; subscription: StoredPushSubscription }>> => {
    await ensureDirectory();
    const entries = await fs.readdir(PUSH_SUBSCRIPTIONS_DIR, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'));

    const result: Array<{ user: string; subscription: StoredPushSubscription }> = [];

    await Promise.all(files.map(async (file) => {
        try {
            const filePath = path.join(PUSH_SUBSCRIPTIONS_DIR, file.name);
            const raw = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(raw);
            const user = typeof parsed?.user === 'string' && parsed.user.trim()
                ? parsed.user.trim()
                : file.name.replace(/\.json$/i, '').toUpperCase();
            const data = normalizeStoredData(user, parsed);
            for (const item of data.items) {
                result.push({ user: data.user, subscription: item });
            }
        } catch {
            // ignora arquivo invalido e segue
        }
    }));

    return result;
};

export const removeEndpointFromAllPushSubscriptions = async (endpoint: string): Promise<number> => {
    await ensureDirectory();
    const entries = await fs.readdir(PUSH_SUBSCRIPTIONS_DIR, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'));

    let removedTotal = 0;

    await Promise.all(files.map(async (file) => {
        const filePath = path.join(PUSH_SUBSCRIPTIONS_DIR, file.name);
        try {
            const raw = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(raw);
            const user = typeof parsed?.user === 'string' && parsed.user.trim()
                ? parsed.user.trim()
                : file.name.replace(/\.json$/i, '').toUpperCase();
            const data = normalizeStoredData(user, parsed);
            const before = data.items.length;
            data.items = data.items.filter((item) => item.endpoint !== endpoint);
            const removed = before - data.items.length;

            if (removed > 0) {
                data.updatedAt = Date.now();
                removedTotal += removed;
                await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
            }
        } catch {
            // ignora arquivo invalido e segue
        }
    }));

    return removedTotal;
};
