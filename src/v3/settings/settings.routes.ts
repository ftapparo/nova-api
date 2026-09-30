import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import { readUserSettings, writeUserSettings } from '../../core/repositories/user-settings.repository';
import { successResponseSchema } from '../shared/response';
import { requireAuth } from '../shared/require-auth';

// =============================================================================
// Preferências do próprio usuário (nomes de portas, atalhos, tema),
// equivalente a /v2/api/user-settings/:user. A chave é o id da conta
// tirado do token — não há como ler ou gravar a preferência de outro
// (fecha o IDOR da v2). Chaves da v2 (ex.: PORTARIA) e da v3 (uuid) não
// colidem na mesma tabela.
// =============================================================================

const settingsSchema = z.object({
    updatedAt: z.number().int(),
    items: z.record(z.string(), z.string()),
    exists: z.boolean(),
});

export async function settingsRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get('/me/settings', {
        onRequest: requireAuth,
        schema: { response: { 200: successResponseSchema(settingsSchema) } },
    }, async (request, reply) => {
        try {
            const data = await readUserSettings(request.actor!.id);
            return reply.ok(data
                ? { updatedAt: data.updatedAt, items: data.items, exists: true }
                : { updatedAt: 0, items: {}, exists: false });
        } catch (error) {
            logger.error('[ApiV3] Falha ao ler preferências:', error);
            return reply.fail({ type: 'internal-error', detail: 'Falha ao carregar preferências.', instance: request.url });
        }
    });

    typedApp.put('/me/settings', {
        onRequest: requireAuth,
        schema: {
            body: z.object({
                // Só valores texto, como na v2; o app serializa o resto.
                items: z.record(z.string().max(100), z.string().max(20_000)).refine(
                    (items) => Object.keys(items).length <= 50,
                    'No máximo 50 preferências.',
                ),
                /** Relógio do cliente (epoch ms): quem tiver o maior vence na sincronização. */
                updatedAt: z.number().int().positive().optional(),
            }),
            response: { 200: successResponseSchema(settingsSchema) },
        },
    }, async (request, reply) => {
        try {
            const data = await writeUserSettings(request.actor!.id, {
                items: request.body.items,
                updatedAt: request.body.updatedAt ?? Date.now(),
            });
            return reply.ok({ updatedAt: data.updatedAt, items: data.items, exists: true });
        } catch (error) {
            logger.error('[ApiV3] Falha ao gravar preferências:', error);
            return reply.fail({ type: 'internal-error', detail: 'Falha ao salvar preferências.', instance: request.url });
        }
    });
}
