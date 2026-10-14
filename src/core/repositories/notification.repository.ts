import { pool } from '../utils/db';

// =============================================================================
// Push nativo do app (Postgres, migração 006). Separado do Web Push do painel
// (push-subscription.repository.ts): outra tabela, outro público, outro envio.
//
// O público de cada aparelho (papel e "morador ativo") é uma foto gravada no
// registro e renovada periodicamente, para escolher destinatários de um
// alarme sem consultar o Firebird nesse momento.
// =============================================================================

export type DevicePlatform = 'android' | 'ios';

export const STAFF_ROLES = ['porteiro', 'sindico', 'admin'] as const;

export type RegisteredDevice = {
    platform: DevicePlatform;
    installationId: string;
    notificationsEnabled: boolean;
    alarmChannelEnabled: boolean;
    registeredAt: Date;
};

export type DeviceTarget = { id: number; accountId: string; token: string };

export type NotificationPreference = {
    exhaustExpiring: boolean;
    exhaustOff: boolean;
    messages: boolean;
    cieStaffAlerts: boolean;
};

export type PreferenceKey = keyof NotificationPreference;

export const DEFAULT_PREFERENCE: NotificationPreference = {
    exhaustExpiring: true,
    exhaustOff: true,
    messages: true,
    cieStaffAlerts: true,
};

const PREFERENCE_COLUMNS: Record<PreferenceKey, string> = {
    exhaustExpiring: 'exhaust_expiring',
    exhaustOff: 'exhaust_off',
    messages: 'messages',
    cieStaffAlerts: 'cie_staff_alerts',
};

/**
 * Registra ou atualiza o aparelho desta instalação. O mesmo aparelho pode
 * trocar de conta (logout e login com outra) e o FCM pode reaproveitar um
 * token: a linha passa para a conta atual e o token sai de qualquer outra
 * instalação. residentActive nulo mantém o valor anterior (Firebird fora).
 */
export const upsertDevice = async (input: {
    accountId: string;
    platform: DevicePlatform;
    installationId: string;
    token: string;
    appVersion: string | null;
    osVersion: string | null;
    deviceModel: string | null;
    notificationsEnabled: boolean;
    alarmChannelEnabled: boolean;
    role: string | null;
    residentActive: boolean | null;
}): Promise<RegisteredDevice> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            'DELETE FROM notification_device WHERE token = $1 AND NOT (platform = $2 AND installation_id = $3)',
            [input.token, input.platform, input.installationId],
        );
        const { rows } = await client.query<{
            platform: DevicePlatform;
            installation_id: string;
            notifications_enabled: boolean;
            alarm_channel_enabled: boolean;
            last_seen_at: Date;
        }>(
            `INSERT INTO notification_device (
                 account_id, platform, installation_id, token, app_version, os_version, device_model,
                 notifications_enabled, alarm_channel_enabled, role, resident_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, false))
             ON CONFLICT (platform, installation_id) DO UPDATE SET
                 account_id = EXCLUDED.account_id,
                 token = EXCLUDED.token,
                 app_version = EXCLUDED.app_version,
                 os_version = EXCLUDED.os_version,
                 device_model = EXCLUDED.device_model,
                 notifications_enabled = EXCLUDED.notifications_enabled,
                 alarm_channel_enabled = EXCLUDED.alarm_channel_enabled,
                 role = EXCLUDED.role,
                 resident_active = COALESCE($11, CASE WHEN notification_device.account_id = EXCLUDED.account_id
                                                      THEN notification_device.resident_active ELSE false END),
                 audience_checked_at = CASE WHEN $11 IS NULL THEN notification_device.audience_checked_at ELSE now() END,
                 last_seen_at = now(),
                 invalidated_at = NULL
             RETURNING platform, installation_id, notifications_enabled, alarm_channel_enabled, last_seen_at`,
            [input.accountId, input.platform, input.installationId, input.token, input.appVersion, input.osVersion,
                input.deviceModel, input.notificationsEnabled, input.alarmChannelEnabled, input.role, input.residentActive],
        );
        await client.query('COMMIT');
        const row = rows[0];
        return {
            platform: row.platform,
            installationId: row.installation_id,
            notificationsEnabled: row.notifications_enabled,
            alarmChannelEnabled: row.alarm_channel_enabled,
            registeredAt: row.last_seen_at,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/** Remove o aparelho (logout). Só apaga se ele pertencer a esta conta. */
export const deleteDevice = async (accountId: string, platform: DevicePlatform, installationId: string): Promise<boolean> => {
    const result = await pool.query(
        'DELETE FROM notification_device WHERE account_id = $1 AND platform = $2 AND installation_id = $3',
        [accountId, platform, installationId],
    );
    return (result.rowCount ?? 0) > 0;
};

export type DeviceAudience =
    | { kind: 'staff' }
    | { kind: 'staff+residents' }
    | { kind: 'accounts'; accountIds: string[] };

/**
 * Aparelhos Android válidos, com permissão de notificação, do público pedido
 * e cuja conta não desligou a preferência informada.
 */
export const listDeviceTargets = async (audience: DeviceAudience, preference?: PreferenceKey): Promise<DeviceTarget[]> => {
    let params: unknown[];
    let audienceClause: string;
    if (audience.kind === 'staff') {
        params = [STAFF_ROLES];
        audienceClause = 'd.role = ANY($1::text[])';
    } else if (audience.kind === 'staff+residents') {
        params = [STAFF_ROLES];
        audienceClause = '(d.role = ANY($1::text[]) OR d.resident_active)';
    } else {
        if (audience.accountIds.length === 0) return [];
        params = [audience.accountIds];
        audienceClause = 'd.account_id = ANY($1::uuid[])';
    }
    const preferenceClause = preference ? `AND COALESCE(p.${PREFERENCE_COLUMNS[preference]}, true)` : '';

    const { rows } = await pool.query<{ id: string; account_id: string; token: string }>(
        `SELECT d.id, d.account_id, d.token
         FROM notification_device d
         LEFT JOIN notification_preference p ON p.account_id = d.account_id
         WHERE d.platform = 'android' AND d.invalidated_at IS NULL AND d.notifications_enabled
           AND ${audienceClause} ${preferenceClause}`,
        params,
    );
    return rows.map((row) => ({ id: Number(row.id), accountId: row.account_id, token: row.token }));
};

/** Tokens que o FCM declarou inválidos deixam de receber até o app registrar de novo. */
export const invalidateTokens = async (tokens: string[]): Promise<void> => {
    if (tokens.length === 0) return;
    await pool.query('UPDATE notification_device SET invalidated_at = now() WHERE token = ANY($1)', [tokens]);
};

/** Contas com aparelho válido cuja foto de público está mais velha que [olderThanMs]. */
export const listAccountsWithStaleAudience = async (olderThanMs: number): Promise<string[]> => {
    const { rows } = await pool.query<{ account_id: string }>(
        `SELECT DISTINCT account_id FROM notification_device
         WHERE invalidated_at IS NULL AND audience_checked_at < now() - make_interval(secs => $1)`,
        [olderThanMs / 1000],
    );
    return rows.map((row) => row.account_id);
};

export const updateResidentActive = async (accountId: string, residentActive: boolean): Promise<void> => {
    await pool.query(
        'UPDATE notification_device SET resident_active = $2, audience_checked_at = now() WHERE account_id = $1',
        [accountId, residentActive],
    );
};

export const readPreference = async (accountId: string): Promise<NotificationPreference> => {
    const { rows } = await pool.query<{
        exhaust_expiring: boolean; exhaust_off: boolean; messages: boolean; cie_staff_alerts: boolean;
    }>(
        'SELECT exhaust_expiring, exhaust_off, messages, cie_staff_alerts FROM notification_preference WHERE account_id = $1',
        [accountId],
    );
    const row = rows[0];
    if (!row) return { ...DEFAULT_PREFERENCE };
    return {
        exhaustExpiring: row.exhaust_expiring,
        exhaustOff: row.exhaust_off,
        messages: row.messages,
        cieStaffAlerts: row.cie_staff_alerts,
    };
};

export const writePreference = async (accountId: string, value: NotificationPreference): Promise<NotificationPreference> => {
    await pool.query(
        `INSERT INTO notification_preference (account_id, exhaust_expiring, exhaust_off, messages, cie_staff_alerts)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_id) DO UPDATE SET
             exhaust_expiring = EXCLUDED.exhaust_expiring,
             exhaust_off = EXCLUDED.exhaust_off,
             messages = EXCLUDED.messages,
             cie_staff_alerts = EXCLUDED.cie_staff_alerts,
             updated_at = now()`,
        [accountId, value.exhaustExpiring, value.exhaustOff, value.messages, value.cieStaffAlerts],
    );
    return value;
};

/**
 * Reserva o envio de um aviso lógico. Devolve o id, ou null se esse aviso
 * (mesma dedupe_key) já foi enviado — a chave sobrevive a reinícios da API.
 */
export const claimDispatch = async (kind: string, dedupeKey: string, audience: string): Promise<number | null> => {
    const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO notification_dispatch (kind, dedupe_key, audience) VALUES ($1, $2, $3)
         ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
        [kind, dedupeKey, audience],
    );
    return rows[0] ? Number(rows[0].id) : null;
};

export const finishDispatch = async (id: number, counts: { target: number; success: number; failure: number }): Promise<void> => {
    await pool.query(
        'UPDATE notification_dispatch SET target_count = $2, success_count = $3, failure_count = $4 WHERE id = $1',
        [id, counts.target, counts.success, counts.failure],
    );
};

/** Momento do último aviso deste tipo, ou null se nunca houve. */
export const lastDispatchAt = async (kind: string): Promise<Date | null> => {
    const { rows } = await pool.query<{ created_at: Date }>(
        'SELECT created_at FROM notification_dispatch WHERE kind = $1 ORDER BY created_at DESC LIMIT 1',
        [kind],
    );
    return rows[0]?.created_at ?? null;
};

export type ExhaustActivation = { exhaustId: string; accountId: string; expiresAt: Date | null };

/** Grava o dono do ciclo atual do exaustor (último ligar/reiniciar pelo app). */
export const upsertExhaustActivation = async (exhaustId: string, accountId: string, expiresAt: Date | null): Promise<void> => {
    await pool.query(
        `INSERT INTO exhaust_activation (exhaust_id, account_id, expires_at) VALUES ($1, $2, $3)
         ON CONFLICT (exhaust_id) DO UPDATE SET
             account_id = EXCLUDED.account_id, expires_at = EXCLUDED.expires_at, activated_at = now()`,
        [exhaustId, accountId, expiresAt],
    );
};

export const findExhaustActivation = async (exhaustId: string): Promise<ExhaustActivation | null> => {
    const { rows } = await pool.query<{ exhaust_id: string; account_id: string; expires_at: Date | null }>(
        'SELECT exhaust_id, account_id, expires_at FROM exhaust_activation WHERE exhaust_id = $1',
        [exhaustId],
    );
    const row = rows[0];
    return row ? { exhaustId: row.exhaust_id, accountId: row.account_id, expiresAt: row.expires_at } : null;
};

export const listExhaustActivations = async (): Promise<ExhaustActivation[]> => {
    const { rows } = await pool.query<{ exhaust_id: string; account_id: string; expires_at: Date | null }>(
        'SELECT exhaust_id, account_id, expires_at FROM exhaust_activation',
    );
    return rows.map((row) => ({ exhaustId: row.exhaust_id, accountId: row.account_id, expiresAt: row.expires_at }));
};

/** Encerra o ciclo. Com [accountId], só apaga se o dono ainda for essa conta. */
export const deleteExhaustActivation = async (exhaustId: string, accountId?: string): Promise<boolean> => {
    const result = accountId
        ? await pool.query('DELETE FROM exhaust_activation WHERE exhaust_id = $1 AND account_id = $2', [exhaustId, accountId])
        : await pool.query('DELETE FROM exhaust_activation WHERE exhaust_id = $1', [exhaustId]);
    return (result.rowCount ?? 0) > 0;
};

/**
 * Limpeza diária: aparelhos inválidos ou sem registro há 60 dias (o app
 * registra a cada abertura) e histórico de envios com mais de 90 dias.
 */
export const pruneNotifications = async (): Promise<void> => {
    await pool.query(
        `DELETE FROM notification_device
         WHERE invalidated_at < now() - interval '7 days' OR last_seen_at < now() - interval '60 days'`,
    );
    await pool.query(`DELETE FROM notification_dispatch WHERE created_at < now() - interval '90 days'`);
};
