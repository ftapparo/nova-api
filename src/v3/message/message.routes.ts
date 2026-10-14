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
    updateCarouselBodySchema,
} from './message.schema';

// =============================================================================
// Comunicados do condomínio (app Android: home 08d, lista 17, detalhe 18).
// Leitura: equipe ou morador com unidade liberada — conta recém-criada e sem
// vínculo não lê comunicados internos. Publicação e arquivamento: síndico e
// admin. Comunicado com notify (padrão) gera push no app quando fica visível
// (message.notifications.ts; decisão de 13/10/2026).
// O carrossel da home (/messages/carousel) tem permanência própria: TTL em
// horas a partir da publicação (padrão 24; 0 = sai ao ser lido) e fixado
// (fica até ser desafixado, sempre com TTL 0), ordenado pela prioridade da
// categoria. A lista de Mensagens não muda com isso.
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
    carouselTtlHours: message.carouselTtlHours,
    pinned: message.pinned,
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

    // Home do app: até 5 comunicados que ainda estão no carrossel desta conta, já ordenados.
    typedApp.get('/messages/carousel', {
        onRequest: readers,
        schema: { response: { 200: successResponseSchema(messageListSchema) } },
    }, async (request, reply) => {
        try {
            const result = await messageRepository.listCarousel(request.actor!.id);
            return reply.ok({ items: result.items.map(toResponse), unreadCount: result.unreadCount });
        } catch (error) {
            logger.error('[ApiV3] Falha ao montar o carrossel de comunicados:', error);
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
            carouselTtlHours: body.pinned ? 0 : body.carouselTtlHours ?? messageRepository.DEFAULT_CAROUSEL_TTL_HOURS,
            pinned: body.pinned ?? false,
            notify: body.notify ?? true,
            createdBy: request.actor!.id,
        });
        logger.info(`[ApiV3] Comunicado ${message.id} publicado por ${request.actor!.id}`);
        return reply.ok(toResponse(message), { status: 201 });
    });

    // Fixar exige TTL 0; desafixar mantém o TTL 0, então o comunicado sai do carrossel
    // de quem já leu e, para quem não leu, quando ler (decisão de 13/10/2026).
    typedApp.patch('/messages/:id', {
        onRequest: publishers,
        schema: { params: messageParamsSchema, body: updateCarouselBodySchema, response: { 200: successResponseSchema(messageSchema) } },
    }, async (request, reply) => {
        const current = await messageRepository.findEditableMessage(request.actor!.id, request.params.id);
        if (!current) return reply.fail(notFound(request.url));

        const pinned = request.body.pinned ?? current.pinned;
        const carouselTtlHours = pinned ? 0 : request.body.carouselTtlHours ?? current.carouselTtlHours;
        if (pinned && (request.body.carouselTtlHours ?? 0) > 0) {
            const detail = 'Comunicado fixado tem TTL 0 no carrossel. Desafixe para definir outro TTL.';
            return reply.fail({ type: 'validation-error', detail, instance: request.url, validationErrors: [{ path: '/carouselTtlHours', message: detail }] });
        }

        if (!(await messageRepository.updateCarousel(current.id, pinned, carouselTtlHours))) return reply.fail(notFound(request.url));
        logger.info(`[ApiV3] Comunicado ${current.id}: fixado=${pinned}, ttl=${carouselTtlHours}h por ${request.actor!.id}`);
        return reply.ok(toResponse({ ...current, pinned, carouselTtlHours }));
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
