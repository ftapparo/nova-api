import { z } from 'zod';
import { MESSAGE_CATEGORIES } from '../../core/repositories/message.repository';

export const messageSchema = z.object({
    id: z.number().int(),
    category: z.enum(MESSAGE_CATEGORIES),
    /** Etiqueta do cartão e do detalhe; nula = o app mostra o nome da categoria. */
    label: z.string().nullable(),
    title: z.string(),
    body: z.string(),
    publishedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().nullable(),
    /** Lido pela conta do token. */
    read: z.boolean(),
});

export const messageListSchema = z.object({
    items: z.array(messageSchema),
    /** Total de não lidos visíveis, independente do filtro e da página (contador do sino). */
    unreadCount: z.number().int().nonnegative(),
});

export const messageListQuerySchema = z.object({
    filter: z.enum(['all', 'unread']).default('all'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

export const messageParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export const createMessageBodySchema = z.object({
    category: z.enum(MESSAGE_CATEGORIES),
    label: z.string().trim().min(1).max(40).optional(),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(5000),
    /** Agendamento: o comunicado só aparece a partir desta data. Omitido = agora. */
    publishedAt: z.iso.datetime({ offset: true }).optional(),
    /** Validade: some da lista depois desta data. */
    expiresAt: z.iso.datetime({ offset: true }).optional(),
}).refine(
    (body) => !body.expiresAt || new Date(body.expiresAt) > new Date(body.publishedAt ?? Date.now()),
    { message: 'A validade precisa ser posterior à publicação.', path: ['expiresAt'] },
);
