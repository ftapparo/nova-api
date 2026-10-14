import { pool } from '../utils/db';

// =============================================================================
// Comunicados do condomínio (Postgres, migrações 003 e 005). "Visível" =
// publicado, não arquivado e não expirado. A leitura é por conta
// (condo_message_read). O carrossel da home é um recorte dos visíveis, com
// permanência própria (TTL em horas, fixado) e ordem por prioridade.
// =============================================================================

export const MESSAGE_CATEGORIES = ['manutencao', 'comunicado', 'aviso', 'urgente'] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

/** Padrão de permanência no carrossel quando o síndico não informa outro. */
export const DEFAULT_CAROUSEL_TTL_HOURS = 24;
export const MAX_CAROUSEL_TTL_HOURS = 720;
/** Itens do carrossel da home. */
export const CAROUSEL_LIMIT = 5;

export type CondoMessage = {
    id: number;
    category: MessageCategory;
    label: string | null;
    title: string;
    body: string;
    publishedAt: Date;
    expiresAt: Date | null;
    /** Horas no carrossel a partir da publicação; 0 = sai do carrossel de cada conta ao ser lido. */
    carouselTtlHours: number;
    /** Fica no carrossel até ser desafixado (sempre com TTL 0). */
    pinned: boolean;
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
    carousel_ttl_hours: number;
    pinned: boolean;
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
    carouselTtlHours: row.carousel_ttl_hours,
    pinned: row.pinned,
    read: row.read,
});

const VISIBLE = `m.archived_at IS NULL AND m.published_at <= now() AND (m.expires_at IS NULL OR m.expires_at > now())`;

const SELECT_WITH_READ = `
    SELECT m.id, m.category, m.label, m.title, m.body, m.published_at, m.expires_at,
           m.carousel_ttl_hours, m.pinned, (r.message_id IS NOT NULL) AS read
    FROM condo_message m
    LEFT JOIN condo_message_read r ON r.message_id = m.id AND r.account_id = $1`;

const countVisible = async (accountId: string): Promise<{ total: number; unread: number }> => {
    const { rows } = await pool.query<{ total: string; unread: string }>(
        `SELECT count(*) AS total, count(*) FILTER (WHERE r.message_id IS NULL) AS unread
         FROM condo_message m
         LEFT JOIN condo_message_read r ON r.message_id = m.id AND r.account_id = $1
         WHERE ${VISIBLE}`,
        [accountId],
    );
    return { total: Number(rows[0]?.total ?? 0), unread: Number(rows[0]?.unread ?? 0) };
};

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
        countVisible(accountId),
    ]);
    return {
        items: page.rows.map(toMessage),
        total: options.unreadOnly ? counts.unread : counts.total,
        unreadCount: counts.unread,
    };
};

// Fixado fica sempre; TTL > 0 conta da publicação; TTL 0 sai quando esta conta lê.
const IN_CAROUSEL = `(
    m.pinned
    OR (m.carousel_ttl_hours > 0 AND m.published_at + make_interval(hours => m.carousel_ttl_hours) > now())
    OR (m.carousel_ttl_hours = 0 AND r.message_id IS NULL)
)`;

// Prioridade da categoria acima de tudo (decisão de 13/10/2026); dentro dela,
// fixados primeiro e depois o mais recente.
const CAROUSEL_ORDER = `
    CASE m.category WHEN 'urgente' THEN 0 WHEN 'aviso' THEN 1 WHEN 'manutencao' THEN 2 ELSE 3 END,
    m.pinned DESC, m.published_at DESC, m.id DESC`;

/** Carrossel da home desta conta, já filtrado e ordenado, com o contador do sino. */
export const listCarousel = async (accountId: string): Promise<{ items: CondoMessage[]; unreadCount: number }> => {
    const [page, counts] = await Promise.all([
        pool.query<MessageRow>(
            `${SELECT_WITH_READ}
             WHERE ${VISIBLE} AND ${IN_CAROUSEL}
             ORDER BY ${CAROUSEL_ORDER}
             LIMIT $2`,
            [accountId, CAROUSEL_LIMIT],
        ),
        countVisible(accountId),
    ]);
    return { items: page.rows.map(toMessage), unreadCount: counts.unread };
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
    carouselTtlHours: number;
    pinned: boolean;
    createdBy: string;
}): Promise<CondoMessage> => {
    const { rows } = await pool.query<Omit<MessageRow, 'read'>>(
        `INSERT INTO condo_message (category, label, title, body, published_at, expires_at, carousel_ttl_hours, pinned, created_by)
         VALUES ($1, $2, $3, $4, COALESCE($5, now()), $6, $7, $8, $9)
         RETURNING id, category, label, title, body, published_at, expires_at, carousel_ttl_hours, pinned`,
        [input.category, input.label, input.title, input.body, input.publishedAt, input.expiresAt,
            input.carouselTtlHours, input.pinned, input.createdBy],
    );
    return toMessage({ ...rows[0], read: false });
};

/**
 * Comunicado não arquivado, inclusive agendado ou vencido: o síndico pode
 * ajustar o carrossel de um comunicado que ainda não apareceu.
 */
export const findEditableMessage = async (accountId: string, id: number): Promise<CondoMessage | null> => {
    const { rows } = await pool.query<MessageRow>(`${SELECT_WITH_READ} WHERE m.id = $2 AND m.archived_at IS NULL`, [accountId, id]);
    return rows[0] ? toMessage(rows[0]) : null;
};

/** Grava fixado e TTL. Quem chama garante a regra "fixado = TTL 0" (a tabela também). */
export const updateCarousel = async (id: number, pinned: boolean, carouselTtlHours: number): Promise<boolean> => {
    const result = await pool.query(
        `UPDATE condo_message SET pinned = $2, carousel_ttl_hours = $3 WHERE id = $1 AND archived_at IS NULL`,
        [id, pinned, carouselTtlHours],
    );
    return (result.rowCount ?? 0) > 0;
};

/** Arquiva (preserva o registro). Devolve false se não existir ou já estiver arquivado. */
export const archiveMessage = async (id: number, archivedBy: string): Promise<boolean> => {
    const result = await pool.query(
        `UPDATE condo_message SET archived_at = now(), archived_by = $2 WHERE id = $1 AND archived_at IS NULL`,
        [id, archivedBy],
    );
    return (result.rowCount ?? 0) > 0;
};
