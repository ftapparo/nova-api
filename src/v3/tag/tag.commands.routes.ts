import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import { getGateByNumeroDispositivo } from '../../core/repositories/control.repository';
import { successResponseSchema, type ErrorType } from '../shared/response';
import { callService, type ServiceCallResult } from '../shared/service-proxy';
import { requireAuth, requireRole } from '../shared/require-auth';
import { AttemptLimiter } from '../shared/attempt-limiter';
import { resolveTagServiceToken, resolveTagV3BaseUrl } from './tag.routes';
import {
    cacheTypeQuerySchema,
    clearCacheResultSchema,
    gateCommandResultSchema,
    gateDeviceBodySchema,
    numeroDispositivoQuerySchema,
    openGateBodySchema,
    removeCacheItemResultSchema,
    restartGateBodySchema,
    restartResultSchema,
} from './tag.schema';

// =============================================================================
// Comandos de portão e limpeza de cache: proxy para a v3 de nova-tag. Só
// equipe, com requireAuth estrito (não só o enforceAuth do escopo):
// comando físico não passa sem ator nem durante AUTH_ENFORCE=false.
// Operações de manutenção (reiniciar, limpar cache, manter aberto) ficam
// com síndico e admin.
// =============================================================================

// Lida dentro da função: imports resolvem antes do dotenv.config().
const resolveCommandTimeout = (): number => {
    const value = Number(process.env.TAG_GATEWAY_COMMAND_TIMEOUT_MS || '10000');
    return Number.isFinite(value) && value > 0 ? value : 10000;
};

const commandsByAccount = new AttemptLimiter(10, 60 * 1000);

const staffOnly = [requireAuth, requireRole('porteiro', 'sindico', 'admin')];
const managersOnly = [requireAuth, requireRole('sindico', 'admin')];

const checkCommandLimit = (request: FastifyRequest, reply: FastifyReply) => {
    const accountId = request.actor!.id;
    const retryAfter = commandsByAccount.retryAfter(accountId);
    if (retryAfter > 0) {
        reply.header('Retry-After', String(retryAfter));
        reply.fail({ type: 'rate-limited', detail: 'Muitos comandos. Tente novamente em instantes.', instance: request.url });
        return false;
    }
    commandsByAccount.hit(accountId);
    return true;
};

// Portão precisa estar cadastrado e ativo no Firebird: também impede que
// numeroDispositivo arbitrário vire uma porta qualquer no host dos TAGs.
const ensureActiveGate = async (request: FastifyRequest, reply: FastifyReply, numeroDispositivo: number) => {
    try {
        if (await getGateByNumeroDispositivo(numeroDispositivo)) return true;
        reply.fail({ type: 'not-found', detail: 'Portão não encontrado ou inativo.', instance: request.url });
    } catch (error) {
        logger.error('[ApiV3] Falha ao consultar portão:', error);
        reply.fail({ type: 'upstream-error', detail: 'Falha ao consultar o cadastro de portões.', instance: request.url });
    }
    return false;
};

// 409 é "o portão recusou" (em movimento/desconectado — não repetir), 400
// é dado inválido, 404 é TAG fora do cache. 401 do TAG é token de serviço
// errado — vira 502, não "faça login".
const TYPE_BY_UPSTREAM_STATUS: Record<number, ErrorType> = {
    400: 'validation-error',
    404: 'not-found',
    409: 'conflict',
    429: 'rate-limited',
};

const sendCommandResult = <T>(request: FastifyRequest, reply: FastifyReply, result: ServiceCallResult<T>) => {
    if (result.ok) return reply.ok(result.data);

    const type = TYPE_BY_UPSTREAM_STATUS[result.status] ?? 'upstream-error';
    logger.error(`[ApiV3] Comando TAG falhou (${result.status}): ${request.method} ${request.url} — ${result.detail}`);
    // O cooldown do TAG não repassa Retry-After pelo proxy; 3 s é o padrão dele.
    if (type === 'rate-limited') reply.header('Retry-After', '3');
    return reply.fail({
        type,
        detail: result.detail,
        instance: request.url,
        ...(type === 'upstream-error' && result.status >= 500 ? { status: result.status } : {}),
    });
};

const forward = <T>(
    request: FastifyRequest,
    numeroDispositivo: number,
    method: 'POST' | 'DELETE',
    path: string,
    options: { body?: unknown; params?: Record<string, unknown> } = {},
) => {
    const actor = request.actor!;
    logger.info(`[ApiV3] Comando TAG ${method} ${path} (dispositivo ${numeroDispositivo}) por ${actor.id} (${actor.role})`);
    return callService<T>({
        baseUrl: resolveTagV3BaseUrl(numeroDispositivo),
        token: resolveTagServiceToken(),
        method,
        path,
        body: options.body,
        params: options.params,
        timeoutMs: resolveCommandTimeout(),
        headers: { 'x-actor-id': actor.id, 'x-actor-role': actor.role ?? '' },
    });
};

export async function tagCommandRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post('/tag/gate/open', {
        onRequest: staffOnly,
        schema: {
            body: openGateBodySchema,
            response: { 200: successResponseSchema(gateCommandResultSchema) },
        },
    }, async (request, reply) => {
        const { numeroDispositivo, ...command } = request.body;

        // Portão aberto sem prazo é decisão de gestão, não de portaria.
        if (command.keepOpen && !['sindico', 'admin'].includes(request.actor!.role ?? '')) {
            return reply.fail({ type: 'forbidden', detail: 'Manter o portão aberto exige síndico ou admin.', instance: request.url });
        }

        if (!(await ensureActiveGate(request, reply, numeroDispositivo))) return;
        if (!checkCommandLimit(request, reply)) return;
        const result = await forward<z.infer<typeof gateCommandResultSchema>>(
            request, numeroDispositivo, 'POST', '/v3/api/gate/open', { body: command },
        );
        return sendCommandResult(request, reply, result);
    });

    typedApp.post('/tag/gate/close', {
        onRequest: staffOnly,
        schema: {
            body: gateDeviceBodySchema,
            response: { 200: successResponseSchema(gateCommandResultSchema) },
        },
    }, async (request, reply) => {
        const { numeroDispositivo } = request.body;
        if (!(await ensureActiveGate(request, reply, numeroDispositivo))) return;
        if (!checkCommandLimit(request, reply)) return;
        const result = await forward<z.infer<typeof gateCommandResultSchema>>(
            request, numeroDispositivo, 'POST', '/v3/api/gate/close', { body: {} },
        );
        return sendCommandResult(request, reply, result);
    });

    typedApp.post('/tag/gate/restart', {
        onRequest: managersOnly,
        schema: {
            body: restartGateBodySchema,
            response: { 200: successResponseSchema(restartResultSchema) },
        },
    }, async (request, reply) => {
        const { numeroDispositivo, confirm } = request.body;

        // Validado aqui também (o TAG repete): recusa antes de consumir a cota.
        if (confirm !== true) {
            return reply.fail({
                type: 'validation-error',
                detail: 'Este comando exige confirmação explícita.',
                instance: request.url,
                validationErrors: [{ path: '/confirm', message: 'Envie confirm: true.' }],
            });
        }

        if (!(await ensureActiveGate(request, reply, numeroDispositivo))) return;
        if (!checkCommandLimit(request, reply)) return;
        const result = await forward<z.infer<typeof restartResultSchema>>(
            request, numeroDispositivo, 'POST', '/v3/api/gate/restart', { body: { confirm: true } },
        );
        return sendCommandResult(request, reply, result);
    });

    typedApp.delete('/tag/cache', {
        onRequest: managersOnly,
        schema: {
            querystring: numeroDispositivoQuerySchema.extend({ type: cacheTypeQuerySchema.optional() }),
            response: { 200: successResponseSchema(clearCacheResultSchema) },
        },
    }, async (request, reply) => {
        const { numeroDispositivo, type } = request.query;
        if (!(await ensureActiveGate(request, reply, numeroDispositivo))) return;
        const result = await forward<z.infer<typeof clearCacheResultSchema>>(
            request, numeroDispositivo, 'DELETE', '/v3/api/cache', { params: type ? { type } : undefined },
        );
        return sendCommandResult(request, reply, result);
    });

    typedApp.delete('/tag/cache/:tag', {
        onRequest: managersOnly,
        schema: {
            params: z.object({ tag: z.string().trim().regex(/^[0-9A-Fa-f]{1,32}$/) }),
            querystring: numeroDispositivoQuerySchema,
            response: { 200: successResponseSchema(removeCacheItemResultSchema) },
        },
    }, async (request, reply) => {
        const { numeroDispositivo } = request.query;
        if (!(await ensureActiveGate(request, reply, numeroDispositivo))) return;
        const result = await forward<z.infer<typeof removeCacheItemResultSchema>>(
            request, numeroDispositivo, 'DELETE', `/v3/api/cache/${encodeURIComponent(request.params.tag)}`,
        );
        return sendCommandResult(request, reply, result);
    });
}
