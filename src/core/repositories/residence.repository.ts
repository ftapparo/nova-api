import { pool } from '../utils/db';
import { executeQuery } from '../services/firebird.service';

// =============================================================================
// Vínculo conta ↔ pessoa (Postgres) e ligações da pessoa com unidades
// (Firebird). Mesmo domínio, duas fontes: o vínculo é nosso, a situação
// residencial é do ERP.
// =============================================================================

export type AccountPersonLink = {
    accountId: string;
    personSeq: number;
    linkedBy: string;
    linkedAt: Date;
};

type LinkRow = { account_id: string; person_seq: number; linked_by: string; linked_at: Date };

const toLink = (row: LinkRow): AccountPersonLink => ({
    accountId: row.account_id,
    personSeq: row.person_seq,
    linkedBy: row.linked_by,
    linkedAt: row.linked_at,
});

export const findLinkByAccount = async (accountId: string): Promise<AccountPersonLink | null> => {
    const { rows } = await pool.query<LinkRow>(
        'SELECT account_id, person_seq, linked_by, linked_at FROM account_person_link WHERE account_id = $1',
        [accountId],
    );
    return rows[0] ? toLink(rows[0]) : null;
};

export const findLinkByPerson = async (personSeq: number): Promise<AccountPersonLink | null> => {
    const { rows } = await pool.query<LinkRow>(
        'SELECT account_id, person_seq, linked_by, linked_at FROM account_person_link WHERE person_seq = $1',
        [personSeq],
    );
    return rows[0] ? toLink(rows[0]) : null;
};

export const listLinks = async (): Promise<AccountPersonLink[]> => {
    const { rows } = await pool.query<LinkRow>(
        'SELECT account_id, person_seq, linked_by, linked_at FROM account_person_link ORDER BY linked_at DESC',
    );
    return rows.map(toLink);
};

/** Cria ou troca o vínculo da conta. Pessoa já vinculada a outra conta viola o UNIQUE. */
export const upsertLink = async (accountId: string, personSeq: number, linkedBy: string): Promise<AccountPersonLink> => {
    const { rows } = await pool.query<LinkRow>(
        `INSERT INTO account_person_link (account_id, person_seq, linked_by, linked_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (account_id) DO UPDATE SET person_seq = $2, linked_by = $3, linked_at = now()
         RETURNING account_id, person_seq, linked_by, linked_at`,
        [accountId, personSeq, linkedBy],
    );
    return toLink(rows[0]);
};

export const deleteLink = async (accountId: string): Promise<boolean> => {
    const result = await pool.query('DELETE FROM account_person_link WHERE account_id = $1', [accountId]);
    return (result.rowCount ?? 0) > 0;
};

// -----------------------------------------------------------------------------
// Firebird
// -----------------------------------------------------------------------------

export type PersonRecord = { sequencia: number; nome: string };

export type PersonUnitRecord = {
    unitSeq: number;
    quadra: string;
    lote: string;
    prop: boolean;
    loc: boolean;
    mor: boolean;
    /** Outra pessoa da mesma unidade marcada como locatária (LOC='S'). */
    unitHasOtherTenant: boolean;
};

// Regra do negócio: só 'S' é verdadeiro; qualquer outro valor (N, nulo,
// espaço) é falso. CHAR do Firebird vem com padding — trim antes.
const isYes = (value: unknown): boolean => String(value ?? '').trim().toUpperCase() === 'S';
const text = (value: unknown): string => String(value ?? '').trim();

export const findPerson = async (personSeq: number): Promise<PersonRecord | null> => {
    const rows = await executeQuery('SELECT SEQUENCIA, NOME FROM PESSOAS WHERE SEQUENCIA = ?', [personSeq]);
    const row = rows?.[0];
    return row ? { sequencia: Number(row.SEQUENCIA), nome: text(row.NOME) } : null;
};

/**
 * Ligações atuais da pessoa com unidades. Ligação removida pelo zelador
 * some da tabela (a linha de PESSOASVINC é apagada), então toda linha
 * retornada é um vínculo existente.
 */
export const findPersonUnits = async (personSeq: number): Promise<PersonUnitRecord[]> => {
    const rows = await executeQuery(
        `SELECT
            pv.SEQUNIDADE, pv.PROP, pv.LOC, pv.MOR, u.QUADRA, u.LOTE,
            (SELECT COUNT(*) FROM PESSOASVINC t
              WHERE t.SEQUNIDADE = pv.SEQUNIDADE
                AND t.SEQPESSOA <> pv.SEQPESSOA
                AND t.LOC = 'S') AS OUTROS_LOCATARIOS
         FROM PESSOASVINC pv
         INNER JOIN UNIDADES u ON u.SEQUENCIA = pv.SEQUNIDADE
         WHERE pv.SEQPESSOA = ?
         ORDER BY u.QUADRA, u.LOTE`,
        [personSeq],
    );

    return (rows ?? []).map((row: Record<string, unknown>) => ({
        unitSeq: Number(row.SEQUNIDADE),
        quadra: text(row.QUADRA),
        lote: text(row.LOTE),
        prop: isYes(row.PROP),
        loc: isYes(row.LOC),
        mor: isYes(row.MOR),
        unitHasOtherTenant: Number(row.OUTROS_LOCATARIOS) > 0,
    }));
};
