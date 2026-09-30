import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import { successResponseSchema, type ErrorType } from '../shared/response';
import { callService, type ServiceCallResult } from '../shared/service-proxy';
import { requireAuth, requireRole } from '../shared/require-auth';
import { AttemptLimiter } from '../shared/attempt-limiter';
import {
    blockCommandBodySchema,
    commandResultSchema,
    CONFIRM_REQUIRED_ACTIONS,
    outputCommandBodySchema,
    simpleCommandActionSchema,
    simpleCommandBodySchema,
} from './cie.schema';

// =============================================================================
// Comandos da central de incêndio: proxy para a v3 de nova-cie. Só equipe
// (decisão de 28/09/2026: morador só lê o CIE). requireAuth estrito, não
// só o enforceAuth do escopo: comando físico não pode passar sem ator nem
// durante o período AUTH_ENFORCE=false. A reconexão com a central não é
// exposta aqui — é operação de manutenção interna (a v2 também não expõe).
// =============================================================================

// Lidas dentro das funções: imports resolvem antes do dotenv.config().
const resolveCieV3BaseUrl = (): string =>
    (process.env.CIE_V3_BASE_URL || 'http://nova-cie:3031').trim().replace(/\/+$/, '');

const resolveCieServiceToken = (): string => process.env.CIE_SERVICE_TOKEN ?? '';

// Comando espera a central responder e o estado ser relido — bem mais lento
// que uma leitura do snapshot em memória.
const resolveCommandTimeout = (): number => {
    const value = Number(process.env.CIE_GATEWAY_COMMAND_TIMEOUT_MS || '20000');
    return Number.isFinite(value) && value > 0 ? value : 20000;
};

const commandsByAccount = new AttemptLimiter(10, 60 * 1000);

const staffOnly = [requireAuth, requireRole('porteiro', 'sindico', 'admin')];

const checkCommandLimit = (request: FastifyRequest, reply: FastifyReply, accountId: string) => {
    const retryAfter = commandsByAccount.retryAfter(accountId);
    if (retryAfter > 0) {
        reply.header('Retry-After', String(retryAfter));
        reply.fail({ type: 'rate-limited', detail: 'Muitos comandos. Tente novamente em instantes.', instance: request.url });
        return false;
    }
    commandsByAccount.hit(accountId);
    return true;
};

// Diferente das leituras, o erro do comando importa para o cliente: 409 é
// "a central recusou" (não adianta repetir), 400 é dado inválido. 401 do
// CIE é configuração errada do token de serviço — vira 502, não "faça login".
const TYPE_BY_UPSTREAM_STATUS: Record<number, ErrorType> = {
    400: 'validation-error',
    409: 'conflict',
};

const sendCommandResult = <T>(request: FastifyRequest, reply: FastifyReply, result: ServiceCallResult<T>) => {
    if (result.ok) return reply.ok(result.data);

    const type = TYPE_BY_UPSTREAM_STATUS[result.status] ?? 'upstream-error';
    logger.error(`[ApiV3] Comando CIE falhou (${result.status}): ${request.method} ${request.url} — ${result.detail}`);
    return reply.fail({
        type,
        detail: result.detail,
        instance: request.url,
        ...(type === 'upstream-error' && result.status >= 500 ? { status: result.status } : {}),
    });
};

const forwardCommand = (request: FastifyRequest, path: string, body: unknown) => {
    const actor = request.actor!;
    logger.info(`[ApiV3] Comando CIE ${path} por ${actor.id} (${actor.role})`);
    return callService<z.infer<typeof commandResultSchema>>({
        baseUrl: resolveCieV3BaseUrl(),
        token: resolveCieServiceToken(),
        method: 'POST',
        path,
        body,
        timeoutMs: resolveCommandTimeout(),
        headers: { 'x-actor-id': actor.id, 'x-actor-role': actor.role ?? '' },
    });
};

export async function cieCommandRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post('/cie/commands/block', {
        onRequest: staffOnly,
        schema: {
            body: blockCommandBodySchema,
            response: { 200: successResponseSchema(commandResultSchema) },
        },
    }, async (request, reply) => {
        if (!checkCommandLimit(request, reply, request.actor!.id)) return;
        const result = await forwardCommand(request, '/v3/api/cie/commands/block', request.body);
        return sendCommandResult(request, reply, result);
    });

    typedApp.post('/cie/commands/output', {
        onRequest: staffOnly,
        schema: {
            body: outputCommandBodySchema,
            response: { 200: successResponseSchema(commandResultSchema) },
        },
    }, async (request, reply) => {
        if (!checkCommandLimit(request, reply, request.actor!.id)) return;
        const result = await forwardCommand(request, '/v3/api/cie/commands/output', request.body);
        return sendCommandResult(request, reply, result);
    });

    typedApp.post('/cie/commands/:action', {
        onRequest: staffOnly,
        schema: {
            params: z.object({ action: simpleCommandActionSchema }),
            body: simpleCommandBodySchema,
            response: { 200: successResponseSchema(commandResultSchema) },
        },
    }, async (request, reply) => {
        const { action } = request.params;

        // Validado aqui também (o CIE repete a checagem): recusa antes de
        // consumir a cota de comandos do usuário.
        if (CONFIRM_REQUIRED_ACTIONS.includes(action) && request.body?.confirm !== true) {
            return reply.fail({
                type: 'validation-error',
                detail: 'Este comando exige confirmação explícita.',
                instance: request.url,
                validationErrors: [{ path: '/confirm', message: 'Envie confirm: true.' }],
            });
        }

        if (!checkCommandLimit(request, reply, request.actor!.id)) return;
        const result = await forwardCommand(request, `/v3/api/cie/commands/${action}`, request.body ?? {});
        return sendCommandResult(request, reply, result);
    });
}
