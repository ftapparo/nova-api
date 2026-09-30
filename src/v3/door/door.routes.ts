import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import { getDoorById, listAvailableDoors } from '../../core/repositories/control.repository';
import { getAccessControlStatusCache } from '../../core/services/access-control.service';
import { DoorOpenError, openDoor } from '../../core/services/door.service';
import { successResponseSchema } from '../shared/response';
import { requireAuth, requireRole } from '../shared/require-auth';
import { AttemptLimiter } from '../shared/attempt-limiter';

// =============================================================================
// Portas de pedestre (leitores faciais), equivalente a /v2/api/control/door/*
// e à parte "doors" do /v2/api/control/status. Só equipe. IP e credenciais
// do equipamento nunca saem da API.
// =============================================================================

const staffOnly = [requireAuth, requireRole('porteiro', 'sindico', 'admin')];

// Comando físico: mesmo limite por conta dos portões e exaustores.
const commandsByAccount = new AttemptLimiter(10, 60 * 1000);

const doorSchema = z.object({ id: z.number().int(), nome: z.string(), porta: z.number().int(), ativo: z.boolean() });
const doorStatusSchema = z.object({
    updatedAt: z.string().nullable(),
    doors: z.array(z.object({ id: z.number().int(), nome: z.string(), porta: z.number().int(), online: z.boolean() })),
});
const openResultSchema = z.object({ id: z.number().int(), nome: z.string(), porta: z.number().int() });

const firebirdFailure = (request: FastifyRequest, reply: FastifyReply, error: unknown) => {
    logger.error('[ApiV3] Falha ao consultar portas:', error);
    return reply.fail({ type: 'upstream-error', detail: 'Falha ao consultar o cadastro de portas.', instance: request.url });
};

export async function doorRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get('/doors', {
        onRequest: staffOnly,
        schema: { response: { 200: successResponseSchema(z.array(doorSchema)) } },
    }, async (request, reply) => {
        try {
            const doors = await listAvailableDoors();
            return reply.ok(doors.map((door) => ({ id: door.sequencia, nome: door.nome, porta: door.porta, ativo: door.ativo === 'S' })));
        } catch (error) {
            return firebirdFailure(request, reply, error);
        }
    });

    // O monitoramento da própria API sonda cada porta a cada minuto; aqui só se lê o cache.
    typedApp.get('/doors/status', {
        onRequest: staffOnly,
        schema: { response: { 200: successResponseSchema(doorStatusSchema) } },
    }, async (_request, reply) => {
        const cache = getAccessControlStatusCache();
        return reply.ok({
            updatedAt: cache.updatedAt,
            doors: cache.doors.map((door) => ({ id: door.id, nome: door.nome, porta: door.porta, online: door.online })),
        });
    });

    typedApp.post('/doors/:id/open', {
        onRequest: staffOnly,
        schema: {
            params: z.object({ id: z.coerce.number().int().positive() }),
            response: { 200: successResponseSchema(openResultSchema) },
        },
    }, async (request, reply) => {
        const actor = request.actor!;
        let door;
        try {
            door = await getDoorById(request.params.id);
        } catch (error) {
            return firebirdFailure(request, reply, error);
        }
        if (!door) return reply.fail({ type: 'not-found', detail: 'Porta não encontrada ou inativa.', instance: request.url });

        const retryAfter = commandsByAccount.retryAfter(actor.id);
        if (retryAfter > 0) {
            reply.header('Retry-After', String(retryAfter));
            return reply.fail({ type: 'rate-limited', detail: 'Muitos comandos. Tente novamente em instantes.', instance: request.url });
        }
        commandsByAccount.hit(actor.id);

        try {
            await openDoor(door);
        } catch (error) {
            const status = error instanceof DoorOpenError ? error.status : 502;
            const detail = error instanceof DoorOpenError ? error.message : 'Falha ao abrir a porta.';
            logger.error(`[ApiV3] Falha ao abrir porta ${door.sequencia}: ${detail}`);
            return status === 409
                ? reply.fail({ type: 'conflict', detail, instance: request.url })
                : reply.fail({ type: 'upstream-error', detail, instance: request.url, status });
        }

        logger.info(`[ApiV3] Porta ${door.sequencia} aberta por ${actor.id} (${actor.role})`);
        return reply.ok({ id: door.sequencia, nome: door.nome, porta: door.porta });
    });
}
