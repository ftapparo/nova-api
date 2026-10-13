import { pool } from '../utils/db';

// =============================================================================
// Aceite do Termo de Uso (Postgres, migração 004). Só INSERT: o registro é a
// prova do aceite e nunca muda.
// =============================================================================

export type AcceptanceChannel = 'signup' | 'google' | 'apple' | 'app';

export type LegalAcceptance = {
    version: string;
    acceptedAt: Date;
};

/** Grava o aceite; repetir a mesma versão não cria outro registro. */
export const insertAcceptance = async (input: {
    accountId: string;
    document: 'termo-de-uso';
    version: string;
    sha256: string;
    channel: AcceptanceChannel;
    ip: string | null;
    userAgent: string | null;
}): Promise<void> => {
    await pool.query(
        `INSERT INTO legal_acceptance (account_id, document, version, sha256, channel, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (account_id, document, version) DO NOTHING`,
        [input.accountId, input.document, input.version, input.sha256, input.channel, input.ip, input.userAgent],
    );
};

/** Último aceite da conta, de qualquer versão. */
export const findLatestAcceptance = async (accountId: string, document: 'termo-de-uso'): Promise<LegalAcceptance | null> => {
    const { rows } = await pool.query<{ version: string; accepted_at: Date }>(
        `SELECT version, accepted_at FROM legal_acceptance
         WHERE account_id = $1 AND document = $2
         ORDER BY accepted_at DESC, id DESC LIMIT 1`,
        [accountId, document],
    );
    return rows[0] ? { version: rows[0].version, acceptedAt: rows[0].accepted_at } : null;
};
