import { pool } from '../utils/db';

export type UserSettingsData = {
    user: string;
    updatedAt: number;
    items: Record<string, string>;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== 'object') return false;
    return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
};

const normalizeItems = (value: unknown): Record<string, string> => {
    const items: Record<string, string> = {};
    if (!isPlainObject(value)) return items;
    for (const [key, itemValue] of Object.entries(value)) {
        if (typeof itemValue === 'string') {
            items[key] = itemValue;
        }
    }
    return items;
};

export const readUserSettings = async (user: string): Promise<UserSettingsData | null> => {
    const result = await pool.query<{ user_id: string; items: unknown; updated_at: Date }>(
        'SELECT user_id, items, updated_at FROM user_settings WHERE user_id = $1',
        [user],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
        user: row.user_id,
        updatedAt: row.updated_at.getTime(),
        items: normalizeItems(row.items),
    };
};

export const writeUserSettings = async (
    user: string,
    data: Pick<UserSettingsData, 'updatedAt' | 'items'>,
): Promise<UserSettingsData> => {
    const updatedAt = Number.isFinite(data.updatedAt) && data.updatedAt > 0 ? Math.trunc(data.updatedAt) : Date.now();

    await pool.query(
        `INSERT INTO user_settings (user_id, items, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET items = EXCLUDED.items, updated_at = EXCLUDED.updated_at`,
        [user, JSON.stringify(data.items), new Date(updatedAt)],
    );

    return {
        user,
        updatedAt,
        items: data.items,
    };
};
