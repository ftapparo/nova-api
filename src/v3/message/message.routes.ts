import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import * as messageRepository from '../../core/repositories/message.repository';
import { successResponseSchema } from '../shared/response';
import { requireAuth, requireRole } from '../shared/require-auth';
import { requireRoleOrResident } from '../residence/residence.guard';
import {
    createMessageBodySchema,
    messageListQuerySchema,
    messageListSchema,
    messageParamsSchema,
    messageSchema,
} from './message.schema';

// =============================================================================
// Comunicados do condomínio (app Android: home 08d, lista 17, detalhe 18).
// Leitura: equipe ou morador com unidade liberada — conta recém-criada e sem
// vínculo não lê comunicados internos. Publicação e arquivamento: síndico e
// admin. Sem push: morador só recebe push de alarme de incêndio.
// requireAuth explícito: as rotas dependem de request.actor.
// =============================================================================

const toResponse = (message: messageRepository.CondoMessage) => ({
    id: message.id,
    category: message.category,
    label: message.label,
    title: message.title,
    body: message.body,
    publishedAt: message.publishedAt.toISOString(),
    expiresAt: message.expiresAt?.toISOString() ?? null,
    read: message.read,
});

export async function messageRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();
    const readers = [requireAuth, requireRoleOrResident('porteiro', 'sindico', 'admin')];
    const publishers = [requireAuth, requireRole('sindico', 'admin')];
    const notFound = (url: string) => ({ type: 'not-found' as const, detail: 'Comunicado não encontrado.', instance: url });

    typedApp.get('/messages', {
        onRequest: readers,
        schema: { querystring: messageListQuerySchema, response: { 200: successResponseSchema(messageListSchema) } },
    }, async (request, reply) => {
        const { filter, limit, offset } = request.query;
        try {
            const result = await messageRepository.listMessages(request.actor!.id, { unreadOnly: filter === 'unread', limit, offset });
            return reply.ok(
                { items: result.items.map(toResponse), unreadCount: result.unreadCount },
                { pagination: { limit, offset, total: result.total } },
            );
        } catch (error) {
            logger.error('[ApiV3] Falha ao listar comunicados:', error);
            return reply.fail({ type: 'internal-error', detail: 'Falha ao carregar os comunicados.', instance: request.url });
        }
    });

    typedApp.get('/messages/:id', {
        onRequest: readers,
        schema: { params: messageParamsSchema, response: { 200: successResponseSchema(messageSchema) } },
    }, async (request, reply) => {
        const message = await messageRepository.findMessage(request.actor!.id, request.params.id);
        return message ? reply.ok(toResponse(message)) : reply.fail(notFound(request.url));
    });

    // Chamado pelo app ao abrir o detalhe; idempotente.
    typedApp.post('/messages/:id/read', {
        onRequest: readers,
        schema: { params: messageParamsSchema, response: { 200: successResponseSchema(messageSchema) } },
    }, async (request, reply) => {
        const message = await messageRepository.markMessageRead(request.actor!.id, request.params.id);
        return message ? reply.ok(toResponse(message)) : reply.fail(notFound(request.url));
    });

    typedApp.post('/messages', {
        onRequest: publishers,
        schema: { body: createMessageBodySchema, response: { 201: successResponseSchema(messageSchema) } },
    }, async (request, reply) => {
        const body = request.body;
        const message = await messageRepository.createMessage({
            category: body.category,
            label: body.label ?? null,
            title: body.title,
            body: body.body,
            publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
            createdBy: request.actor!.id,
        });
        logger.info(`[ApiV3] Comunicado ${message.id} publicado por ${request.actor!.id}`);
        return reply.ok(toResponse(message), { status: 201 });
    });

    typedApp.delete('/messages/:id', {
        onRequest: publishers,
        schema: { params: messageParamsSchema, response: { 200: successResponseSchema(z.null()) } },
    }, async (request, reply) => {
        const archived = await messageRepository.archiveMessage(request.params.id, request.actor!.id);
        if (!archived) return reply.fail(notFound(request.url));
        logger.info(`[ApiV3] Comunicado ${request.params.id} arquivado por ${request.actor!.id}`);
        return reply.ok(null);
    });
}
