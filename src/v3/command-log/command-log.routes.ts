import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import { listCommandLogs } from '../../core/services/command-log.service';
import { successResponseSchema } from '../shared/response';
import { requireAuth, requireRole } from '../shared/require-auth';

// Histórico de comandos (v2 e v3 no mesmo arquivo — ver shared/command-audit.ts),
// equivalente a /v2/api/commands/logs. Só equipe.

// Só timestamp e command são garantidos em linhas antigas do arquivo
// (core/command-log descarta o resto sem validar); os demais são opcionais
// para uma linha velha não derrubar a resposta inteira.
export const commandLogSchema = z.object({
    id: z.string().optional(),
    timestamp: z.string(),
    requestId: z.string().nullable().optional(),
    method: z.string().optional(),
    path: z.string().optional(),
    command: z.string(),
    status: z.number().optional(),
    actor: z.string().optional(),
    ip: z.string().nullable().optional(),
});

export async function commandLogRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get('/commands/logs', {
        onRequest: [requireAuth, requireRole('porteiro', 'sindico', 'admin')],
        schema: {
            querystring: z.object({ limit: z.coerce.number().int().min(1).max(200).default(20) }),
            response: { 200: successResponseSchema(z.array(commandLogSchema)) },
        },
    }, async (request, reply) => {
        try {
            return reply.ok(listCommandLogs(request.query.limit));
        } catch (error) {
            logger.error('[ApiV3] Falha ao ler log de comandos:', error);
            return reply.fail({ type: 'internal-error', detail: 'Falha ao ler o histórico de comandos.', instance: request.url });
        }
    });
}
