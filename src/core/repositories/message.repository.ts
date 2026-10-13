import { pool } from '../utils/db';

// =============================================================================
// Comunicados do condomínio (Postgres, migração 003). "Visível" = publicado,
// não arquivado e não expirado. A leitura é por conta (condo_message_read).
// =============================================================================

export const MESSAGE_CATEGORIES = ['manutencao', 'comunicado', 'aviso', 'urgente'] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

export type CondoMessage = {
    id: number;
    category: MessageCategory;
    label: string | null;
    title: string;
    body: string;
    publishedAt: Date;
    expiresAt: Date | null;
    read: boolean;
};

type MessageRow = {
    id: string;
    category: MessageCategory;
    label: string | null;
    title: string;
    body: string;
    published_at: Date;
    expires_at: Date | null;
    read: boolean;
};

// pg devolve BIGINT como texto; os ids cabem com folga num inteiro seguro do JS.
const toMessage = (row: MessageRow): CondoMessage => ({
    id: Number(row.id),
    category: row.category,
    label: row.label,
    title: row.title,
    body: row.body,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    read: row.read,
});

const VISIBLE = `m.archived_at IS NULL AND m.published_at <= now() AND (m.expires_at IS NULL OR m.expires_at > now())`;

const SELECT_WITH_READ = `
    SELECT m.id, m.category, m.label, m.title, m.body, m.published_at, m.expires_at,
           (r.message_id IS NOT NULL) AS read
    FROM condo_message m
    LEFT JOIN condo_message_read r ON r.message_id = m.id AND r.account_id = $1`;

export const listMessages = async (
    accountId: string,
    options: { unreadOnly: boolean; limit: number; offset: number },
): Promise<{ items: CondoMessage[]; total: number; unreadCount: number }> => {
    const filter = options.unreadOnly ? `AND r.message_id IS NULL` : '';
    const [page, counts] = await Promise.all([
        pool.query<MessageRow>(
            `${SELECT_WITH_READ}
             WHERE ${VISIBLE} ${filter}
             ORDER BY m.published_at DESC, m.id DESC
             LIMIT $2 OFFSET $3`,
            [accountId, options.limit, options.offset],
        ),
        pool.query<{ total: string; unread: string }>(
            `SELECT count(*) AS total, count(*) FILTER (WHERE r.message_id IS NULL) AS unread
             FROM condo_message m
             LEFT JOIN condo_message_read r ON r.message_id = m.id AND r.account_id = $1
             WHERE ${VISIBLE}`,
            [accountId],
        ),
    ]);
    const unreadCount = Number(counts.rows[0]?.unread ?? 0);
    return {
        items: page.rows.map(toMessage),
        total: options.unreadOnly ? unreadCount : Number(counts.rows[0]?.total ?? 0),
        unreadCount,
    };
};

export const findMessage = async (accountId: string, id: number): Promise<CondoMessage | null> => {
    const { rows } = await pool.query<MessageRow>(`${SELECT_WITH_READ} WHERE m.id = $2 AND ${VISIBLE}`, [accountId, id]);
    return rows[0] ? toMessage(rows[0]) : null;
};

/** Marca como lido (idempotente). Devolve o comunicado, ou null se não estiver visível. */
export const markMessageRead = async (accountId: string, id: number): Promise<CondoMessage | null> => {
    const message = await findMessage(accountId, id);
    if (!message) return null;
    if (!message.read) {
        await pool.query(
            `INSERT INTO condo_message_read (message_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [id, accountId],
        );
    }
    return { ...message, read: true };
};

export const createMessage = async (input: {
    category: MessageCategory;
    label: string | null;
    title: string;
    body: string;
    publishedAt: Date | null;
    expiresAt: Date | null;
    createdBy: string;
}): Promise<CondoMessage> => {
    const { rows } = await pool.query<Omit<MessageRow, 'read'>>(
        `INSERT INTO condo_message (category, label, title, body, published_at, expires_at, created_by)
         VALUES ($1, $2, $3, $4, COALESCE($5, now()), $6, $7)
         RETURNING id, category, label, title, body, published_at, expires_at`,
        [input.category, input.label, input.title, input.body, input.publishedAt, input.expiresAt, input.createdBy],
    );
    return toMessage({ ...rows[0], read: false });
};

/** Arquiva (preserva o registro). Devolve false se não existir ou já estiver arquivado. */
export const archiveMessage = async (id: number, archivedBy: string): Promise<boolean> => {
    const result = await pool.query(
        `UPDATE condo_message SET archived_at = now(), archived_by = $2 WHERE id = $1 AND archived_at IS NULL`,
        [id, archivedBy],
    );
    return (result.rowCount ?? 0) > 0;
};
