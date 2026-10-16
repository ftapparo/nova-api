import { pool } from '../utils/db';

// =============================================================================
// Registro de atividades (Postgres, migração 008). Só INSERT e limpeza por
// idade: nada é alterado depois de gravado.
// =============================================================================

export type AuditRecord = {
    accountId: string | null;
    actorRole: string | null;
    action: string;
    target: Record<string, unknown> | null;
    outcome: string;
    httpStatus: number | null;
    requestId: string | null;
    ip: string | null;
    appVersion: string | null;
    details: Record<string, unknown> | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const insertAuditEvent = async (record: AuditRecord): Promise<void> => {
    await pool.query(
        `INSERT INTO audit_event (account_id, actor_role, action, target, outcome, http_status, request_id, ip, app_version, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet, $9, $10)`,
        [
            record.accountId && UUID.test(record.accountId) ? record.accountId : null,
            record.actorRole,
            record.action.slice(0, 200),
            record.target ? JSON.stringify(record.target) : null,
            record.outcome.slice(0, 40),
            record.httpStatus,
            record.requestId?.slice(0, 100) ?? null,
            record.ip,
            record.appVersion?.slice(0, 40) ?? null,
            record.details ? JSON.stringify(record.details) : null,
        ],
    );
};

export const pruneAuditEvents = async (retentionDays: number): Promise<void> => {
    await pool.query(`DELETE FROM audit_event WHERE occurred_at < now() - make_interval(days => $1)`, [retentionDays]);
};
