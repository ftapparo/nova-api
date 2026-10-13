import { pool } from '../utils/db';

// =============================================================================
// Exclusão da própria conta (Play/LGPD). Remove o que é só da conta: vínculo
// com o cadastro, preferências, inscrições de push e leituras de comunicados.
//
// Ficam, por conservação legítima (Termo 6.4 e 20.3, Política 11.2 e 14.2):
// legal_acceptance (prova do aceite do Termo) e os logs de comando, com os
// prazos da Política. O cadastro da pessoa no Firebird é do condomínio e não
// é tocado.
// =============================================================================

export type DeletedAccountData = { personSeq: number | null };

/**
 * Apaga os dados da conta numa transação e só confirma se [deleteLogin] (a
 * exclusão no GoTrue) também der certo — nunca sobra login sem dados nem
 * dados de uma conta que continua existindo.
 */
export const deleteAccountData = async (
    accountId: string,
    deleteLogin: () => Promise<boolean>,
): Promise<DeletedAccountData | null> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const link = await client.query<{ person_seq: number }>(
            'DELETE FROM account_person_link WHERE account_id = $1 RETURNING person_seq',
            [accountId],
        );
        await client.query('DELETE FROM user_settings WHERE user_id = $1', [accountId]);
        await client.query('DELETE FROM push_subscriptions WHERE user_id = $1', [accountId]);
        await client.query('DELETE FROM condo_message_read WHERE account_id = $1', [accountId]);

        if (!(await deleteLogin())) {
            await client.query('ROLLBACK');
            return null;
        }
        await client.query('COMMIT');
        return { personSeq: link.rows[0]?.person_seq ?? null };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};
