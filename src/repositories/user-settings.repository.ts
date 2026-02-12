import { promises as fs } from 'fs';
import path from 'path';

export type UserSettingsData = {
    user: string;
    updatedAt: number;
    items: Record<string, string>;
};

const USER_SETTINGS_DIR = path.resolve(process.env.USER_SETTINGS_DIR || path.join(process.cwd(), 'storage', 'user-settings'));

let ensureDirPromise: Promise<unknown> | null = null;

const ensureUserSettingsDirectory = async (): Promise<void> => {
    if (!ensureDirPromise) {
        ensureDirPromise = fs.mkdir(USER_SETTINGS_DIR, { recursive: true });
    }
    await ensureDirPromise;
};

const sanitizeUserForFile = (user: string): string => user.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_');

const getUserSettingsFilePath = (user: string): string => {
    const safeUser = sanitizeUserForFile(user);
    return path.join(USER_SETTINGS_DIR, `${safeUser}.json`);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== 'object') return false;
    return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
};

const normalizeStoredData = (user: string, value: unknown): UserSettingsData | null => {
    if (!isPlainObject(value)) return null;

    const rawUpdatedAt = value.updatedAt;
    const updatedAt = typeof rawUpdatedAt === 'number' && Number.isFinite(rawUpdatedAt) && rawUpdatedAt > 0
        ? Math.trunc(rawUpdatedAt)
        : 0;

    const rawItems = value.items;
    const items: Record<string, string> = {};
    if (isPlainObject(rawItems)) {
        for (const [key, itemValue] of Object.entries(rawItems)) {
            if (typeof itemValue === 'string') {
                items[key] = itemValue;
            }
        }
    }

    return {
        user,
        updatedAt,
        items,
    };
};

export const readUserSettings = async (user: string): Promise<UserSettingsData | null> => {
    await ensureUserSettingsDirectory();
    const filePath = getUserSettingsFilePath(user);

    try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return normalizeStoredData(user, parsed);
    } catch (error: any) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
};

export const writeUserSettings = async (
    user: string,
    data: Pick<UserSettingsData, 'updatedAt' | 'items'>,
): Promise<UserSettingsData> => {
    await ensureUserSettingsDirectory();
    const filePath = getUserSettingsFilePath(user);

    const payload: UserSettingsData = {
        user,
        updatedAt: Number.isFinite(data.updatedAt) && data.updatedAt > 0 ? Math.trunc(data.updatedAt) : Date.now(),
        items: data.items,
    };

    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return payload;
};
