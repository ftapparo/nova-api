import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import { removePushSubscriptionByEndpoint, upsertPushSubscription } from '../../core/repositories/push-subscription.repository';
import { getPublicPushKey, sendGenericPushToAll } from '../../core/services/push.service';
import { successResponseSchema } from '../shared/response';
import { requireAuth } from '../shared/require-auth';
import { requireRoleOrService } from '../shared/service-auth';

// =============================================================================
// Web Push (VAPID), equivalente a /v2/api/push/*. A inscrição fica em nome
// da conta do token (não de um "user" enviado pelo cliente). O envio
// dispara para todas as inscrições — só síndico/admin, ou o CIE com token
// de serviço (alarme de incêndio/falha).
//
// /v2/api/push/events/fire-alarm não foi migrada: nada a chama (o CIE usa
// /push/send). FCM/APNs para os apps nativos ficam para a Etapa 4.3.
// =============================================================================

const subscriptionSchema = z.object({
    endpoint: z.url().max(2000),
    expirationTime: z.number().int().nullish(),
    keys: z.object({ p256dh: z.string().trim().min(1).max(500), auth: z.string().trim().min(1).max(500) }),
});

const subscriptionsSummarySchema = z.object({ updatedAt: z.number(), totalSubscriptions: z.number().int() });
const dispatchSchema = z.object({
    sentAt: z.number(),
    dispatch: z.object({
        totalSubscriptions: z.number().int(),
        sent: z.number().int(),
        failed: z.number().int(),
        removedInvalid: z.number().int(),
    }),
});

export async function pushRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get('/push/public-key', {
        onRequest: requireAuth,
        schema: { response: { 200: successResponseSchema(z.object({ publicKey: z.string() })) } },
    }, async (request, reply) => {
        try {
            return reply.ok({ publicKey: getPublicPushKey() });
        } catch (error) {
            logger.error('[ApiV3] Chave pública de push indisponível:', error);
            return reply.fail({ type: 'internal-error', detail: 'Notificações indisponíveis no momento.', instance: request.url });
        }
    });

    typedApp.post('/push/subscriptions', {
        onRequest: requireAuth,
        schema: {
            body: z.object({
                subscription: subscriptionSchema,
                meta: z.object({ ua: z.string().max(500).optional(), platform: z.string().max(20).optional() }).optional(),
            }),
            response: { 200: successResponseSchema(subscriptionsSummarySchema) },
        },
    }, async (request, reply) => {
        const { subscription, meta } = request.body;
        try {
            const data = await upsertPushSubscription(request.actor!.id, {
                endpoint: subscription.endpoint,
                expirationTime: subscription.expirationTime ?? null,
                keys: subscription.keys,
            }, {
                ua: meta?.ua ?? (typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null),
                platform: meta?.platform ?? 'web',
            });
            return reply.ok({ updatedAt: data.updatedAt, totalSubscriptions: data.items.length });
        } catch (error) {
            logger.error('[ApiV3] Falha ao salvar inscrição de push:', error);
            return reply.fail({ type: 'internal-error', detail: 'Falha ao salvar a inscrição de notificações.', instance: request.url });
        }
    });

    typedApp.delete('/push/subscriptions', {
        onRequest: requireAuth,
        schema: {
            body: z.object({ endpoint: z.string().trim().min(1).max(2000) }),
            response: { 200: successResponseSchema(subscriptionsSummarySchema.extend({ removed: z.boolean() })) },
        },
    }, async (request, reply) => {
        try {
            const result = await removePushSubscriptionByEndpoint(request.actor!.id, request.body.endpoint);
            return reply.ok({
                updatedAt: result.data.updatedAt,
                totalSubscriptions: result.data.items.length,
                removed: Boolean(result.removed),
            });
        } catch (error) {
            logger.error('[ApiV3] Falha ao remover inscrição de push:', error);
            return reply.fail({ type: 'internal-error', detail: 'Falha ao remover a inscrição de notificações.', instance: request.url });
        }
    });

    typedApp.post('/push/send', {
        onRequest: requireRoleOrService('sindico', 'admin'),
        config: { allowServiceToken: true },
        schema: {
            body: z.object({
                title: z.string().max(200).optional(),
                body: z.string().max(2000).optional(),
                tag: z.string().max(100).optional(),
                icon: z.string().max(500).optional(),
                badge: z.string().max(500).optional(),
                requireInteraction: z.boolean().optional(),
                data: z.record(z.string(), z.unknown()).optional(),
            }),
            response: { 200: successResponseSchema(dispatchSchema) },
        },
    }, async (request, reply) => {
        try {
            const dispatch = await sendGenericPushToAll(request.body);
            logger.info(`[ApiV3] Push enviado por ${request.actor?.id ?? 'serviço'}: ${dispatch.sent}/${dispatch.totalSubscriptions}`);
            return reply.ok({ sentAt: Date.now(), dispatch });
        } catch (error) {
            logger.error('[ApiV3] Falha ao enviar push:', error);
            return reply.fail({ type: 'internal-error', detail: 'Falha ao enviar a notificação.', instance: request.url });
        }
    });
}
