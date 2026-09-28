import { promises as fs } from 'fs';
import path from 'path';
import { pool } from '../utils/db';

// Migra os dados hoje gravados em arquivos .json (user-settings e
// push-subscriptions) para as tabelas Postgres criadas em
// infra/postgres/migrations/001_user_settings_and_push_subscriptions.sql.
//
// Não apaga nem altera os arquivos .json originais — eles continuam como
// estavam, servindo de backup até confirmarmos que a migração dos
// repositórios (parte 3) está funcionando em produção.
//
// Uso: rodar dentro do container nova-api (ou com as mesmas env vars),
// já que é lá que os volumes de storage estão montados.
//   node dist/scripts/migrate-json-to-postgres.js

const USER_SETTINGS_DIR = path.resolve(
    process.env.USER_SETTINGS_DIR || path.join(process.cwd(), 'storage', 'user-settings'),
);
const PUSH_SUBSCRIPTIONS_DIR = path.resolve(
    process.env.PUSH_SUBSCRIPTIONS_DIR || path.join(process.cwd(), 'storage', 'push-subscriptions'),
);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};

async function migrateUserSettings(): Promise<number> {
    let files: string[] = [];
    try {
        const entries = await fs.readdir(USER_SETTINGS_DIR, { withFileTypes: true });
        files = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json')).map((e) => e.name);
    } catch (error: any) {
        if (error?.code === 'ENOENT') {
            console.log(`[migrate] Diretório de user-settings não existe (${USER_SETTINGS_DIR}), nada a migrar.`);
            return 0;
        }
        throw error;
    }

    let migrated = 0;
    for (const file of files) {
        const filePath = path.join(USER_SETTINGS_DIR, file);
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!isPlainObject(parsed)) {
            console.warn(`[migrate] user-settings: ${file} ignorado (formato inválido)`);
            continue;
        }

        const user = typeof parsed.user === 'string' && parsed.user.trim()
            ? parsed.user.trim()
            : file.replace(/\.json$/i, '');
        const updatedAt = typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
            ? new Date(parsed.updatedAt)
            : new Date();
        const items = isPlainObject(parsed.items) ? parsed.items : {};

        await pool.query(
            `INSERT INTO user_settings (user_id, items, updated_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE SET items = EXCLUDED.items, updated_at = EXCLUDED.updated_at`,
            [user, JSON.stringify(items), updatedAt],
        );
        migrated += 1;
        console.log(`[migrate] user-settings: ${user} migrado`);
    }
    return migrated;
}

async function migratePushSubscriptions(): Promise<number> {
    let files: string[] = [];
    try {
        const entries = await fs.readdir(PUSH_SUBSCRIPTIONS_DIR, { withFileTypes: true });
        files = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json')).map((e) => e.name);
    } catch (error: any) {
        if (error?.code === 'ENOENT') {
            console.log(`[migrate] Diretório de push-subscriptions não existe (${PUSH_SUBSCRIPTIONS_DIR}), nada a migrar.`);
            return 0;
        }
        throw error;
    }

    let migrated = 0;
    for (const file of files) {
        const filePath = path.join(PUSH_SUBSCRIPTIONS_DIR, file);
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!isPlainObject(parsed)) {
            console.warn(`[migrate] push-subscriptions: ${file} ignorado (formato inválido)`);
            continue;
        }

        const user = typeof parsed.user === 'string' && parsed.user.trim()
            ? parsed.user.trim()
            : file.replace(/\.json$/i, '').toUpperCase();
        const items = Array.isArray(parsed.items) ? parsed.items : [];

        for (const item of items) {
            if (!isPlainObject(item) || !isPlainObject(item.keys)) continue;
            const endpoint = typeof item.endpoint === 'string' ? item.endpoint.trim() : '';
            const p256dh = typeof item.keys.p256dh === 'string' ? item.keys.p256dh.trim() : '';
            const auth = typeof item.keys.auth === 'string' ? item.keys.auth.trim() : '';
            if (!endpoint || !p256dh || !auth) continue;

            const expirationTime = typeof item.expirationTime === 'number' && Number.isFinite(item.expirationTime)
                ? Math.trunc(item.expirationTime)
                : null;
            const createdAt = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
                ? new Date(item.createdAt)
                : new Date();
            const updatedAt = typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
                ? new Date(item.updatedAt)
                : createdAt;
            const ua = typeof item.ua === 'string' && item.ua.trim() ? item.ua.trim() : null;
            const platform = typeof item.platform === 'string' && item.platform.trim() ? item.platform.trim() : null;

            await pool.query(
                `INSERT INTO push_subscriptions
                    (user_id, endpoint, expiration_time, p256dh, auth, ua, platform, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (endpoint) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    expiration_time = EXCLUDED.expiration_time,
                    p256dh = EXCLUDED.p256dh,
                    auth = EXCLUDED.auth,
                    ua = EXCLUDED.ua,
                    platform = EXCLUDED.platform,
                    updated_at = EXCLUDED.updated_at`,
                [user, endpoint, expirationTime, p256dh, auth, ua, platform, createdAt, updatedAt],
            );
            migrated += 1;
        }
        console.log(`[migrate] push-subscriptions: ${user} — ${items.length} inscrição(ões) processada(s)`);
    }
    return migrated;
}

async function main() {
    console.log('[migrate] Iniciando migração JSON -> Postgres');
    console.log(`[migrate] USER_SETTINGS_DIR=${USER_SETTINGS_DIR}`);
    console.log(`[migrate] PUSH_SUBSCRIPTIONS_DIR=${PUSH_SUBSCRIPTIONS_DIR}`);

    const settingsCount = await migrateUserSettings();
    const subsCount = await migratePushSubscriptions();

    console.log(`[migrate] Concluído: ${settingsCount} user-settings, ${subsCount} push-subscriptions.`);
    await pool.end();
}

main().catch((error) => {
    console.error('[migrate] ERRO:', error);
    process.exitCode = 1;
});
