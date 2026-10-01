import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import { configureExhaustModule, getExhaustStatus, turnOffExhaust, turnOnExhaust } from '../../core/services/exhaust.service';
import { successResponseSchema } from '../shared/response';
import { requireAuth, requireRole, type Actor } from '../shared/require-auth';
import { AttemptLimiter } from '../shared/attempt-limiter';
import { getResidence } from '../residence/residence.service';
import { configBodySchema, configParamsSchema, exhaustParamsSchema, exhaustSchema, maintenanceBodySchema, turnOnBodySchema, type Exhaust } from './exhaust.schema';
import { isInMaintenance, setMaintenance } from './exhaust.maintenance';

// =============================================================================
// Exaustores das churrasqueiras (decisão de 28/09/2026): todos os papéis
// acessam. Equipe vê e opera os 24; morador vê e opera só a prumada das
// suas unidades liberadas — A-124 → exaustor A4 (torre + último dígito do
// apartamento, mesma conversão da v2).
//
// requireAuth estrito (não só o enforceAuth do escopo): o acesso depende
// de quem é o ator, então não há modo "sem token" aqui.
// =============================================================================

const TOWERS = ['A', 'B', 'C'] as const;
const ALL_EXHAUST_IDS = TOWERS.flatMap((tower) => [1, 2, 3, 4, 5, 6, 7, 8].map((final) => `${tower}${final}`));
const STAFF_ROLES = ['porteiro', 'sindico', 'admin'];

// Comando aciona relé físico: limite por conta, no mesmo espírito do
// rate limit de comando da v2 (commandsOnly).
const commandsByAccount = new AttemptLimiter(10, 60 * 1000);

/** Unidade do Firebird → exaustor, ou null se não mapear (ex.: lote sem final 1-8). */
const unitToExhaustId = (quadra: string, lote: string): string | null => {
    const tower = quadra.trim().toUpperCase();
    const final = lote.trim().match(/(\d)\D*$/)?.[1];
    if (!final || !(TOWERS as readonly string[]).includes(tower) || Number(final) < 1 || Number(final) > 8) return null;
    return `${tower}${final}`;
};

export const resolveAllowedIds = async (actor: Actor): Promise<string[]> => {
    if (actor.role && STAFF_ROLES.includes(actor.role)) return ALL_EXHAUST_IDS;

    const residence = await getResidence(actor.id);
    const ids = residence.units
        .filter((unit) => !unit.blocked)
        .map((unit) => unitToExhaustId(unit.quadra, unit.lote))
        .filter((id): id is string => id !== null);
    return [...new Set(ids)];
};

export const toExhaust = async (id: string): Promise<Exhaust> => {
    const status = await getExhaustStatus(id);
    const memory = status.memory;
    const module = status.moduleStatus;
    return {
        id,
        tower: status.tower,
        final: status.final,
        on: memory?.pendingCommand === 'ligar',
        expiresAt: memory?.expiresAt ?? null,
        processStatus: memory?.processStatus ?? null,
        moduleOnline: Boolean(module && module.statusCode === 200 && !module.error),
        command: memory?.pendingCommand === 'ligar' || memory?.pendingCommand === 'desligar' ? memory.pendingCommand : null,
        maintenance: isInMaintenance(id),
    };
};

// Mesmo 404 para "não existe" e "não é seu": não revela a um morador quais
// exaustores existem além do dele.
const forbiddenOrMissing = (request: FastifyRequest, reply: FastifyReply) =>
    reply.fail({ type: 'not-found', detail: 'Exaustor não encontrado.', instance: request.url });

// Erros do core carregam `status` (ex.: 503 com módulo offline). A mensagem
// é operacional ("Módulo A_14 está offline"), útil para quem opera.
const sendCoreError = (request: FastifyRequest, reply: FastifyReply, error: unknown, action: string) => {
    const status = (error as { status?: number })?.status;
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[ApiV3] Falha ao ${action} exaustor: ${message}`);
    if (status === 503) {
        return reply.fail({ type: 'upstream-error', detail: message, instance: request.url, status: 503 });
    }
    return reply.fail({ type: 'upstream-error', detail: `Falha ao ${action} o exaustor.`, instance: request.url });
};

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

export async function exhaustRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get('/exhausts', {
        onRequest: requireAuth,
        schema: { response: { 200: successResponseSchema(z.array(exhaustSchema)) } },
    }, async (request, reply) => {
        const ids = await resolveAllowedIds(request.actor!);
        return reply.ok(await Promise.all(ids.map(toExhaust)));
    });

    typedApp.post('/exhausts/:id/on', {
        onRequest: requireAuth,
        schema: {
            params: exhaustParamsSchema,
            body: turnOnBodySchema,
            response: { 200: successResponseSchema(exhaustSchema) },
        },
    }, async (request, reply) => {
        const actor = request.actor!;
        const { id } = request.params;
        if (!(await resolveAllowedIds(actor)).includes(id)) return forbiddenOrMissing(request, reply);
        if (isInMaintenance(id)) {
            return reply.fail({ type: 'conflict', detail: 'Exaustor em manutenção.', instance: request.url });
        }
        if (!checkCommandLimit(request, reply, actor.id)) return;

        // Com o exaustor já ligado, o core regrava o estado e recalcula o
        // expiresAt: é assim que o app "reinicia o tempo" (relé continua ligado).
        try {
            await turnOnExhaust(id, request.body.minutes);
        } catch (error) {
            return sendCoreError(request, reply, error, 'ligar');
        }
        logger.info(`[ApiV3] Exaustor ${id} ligado por ${actor.id}${request.body.minutes ? ` (${request.body.minutes} min)` : ''}`);
        return reply.ok(await toExhaust(id));
    });

    typedApp.post('/exhausts/:id/off', {
        onRequest: requireAuth,
        schema: {
            params: exhaustParamsSchema,
            response: { 200: successResponseSchema(exhaustSchema) },
        },
    }, async (request, reply) => {
        const actor = request.actor!;
        const { id } = request.params;
        if (!(await resolveAllowedIds(actor)).includes(id)) return forbiddenOrMissing(request, reply);
        if (!checkCommandLimit(request, reply, actor.id)) return;

        try {
            await turnOffExhaust(id);
        } catch (error) {
            return sendCoreError(request, reply, error, 'desligar');
        }
        logger.info(`[ApiV3] Exaustor ${id} desligado por ${actor.id}`);
        return reply.ok(await toExhaust(id));
    });

    // Manutenção: a equipe responsável pelo condomínio marca/desmarca. Não
    // aciona relé, então não entra no limite de comandos.
    typedApp.put('/exhausts/:id/maintenance', {
        onRequest: [requireAuth, requireRole('sindico', 'admin')],
        schema: {
            params: exhaustParamsSchema,
            body: maintenanceBodySchema,
            response: { 200: successResponseSchema(exhaustSchema) },
        },
    }, async (request, reply) => {
        const { id } = request.params;
        try {
            setMaintenance(id, request.body.maintenance);
        } catch (error) {
            logger.error(`[ApiV3] Falha ao gravar manutenção do exaustor ${id}:`, error);
            return reply.fail({ type: 'internal-error', detail: 'Não foi possível salvar a manutenção.', instance: request.url });
        }
        logger.info(`[ApiV3] Exaustor ${id} ${request.body.maintenance ? 'em' : 'fora de'} manutenção por ${request.actor!.id}`);
        return reply.ok(await toExhaust(id));
    });

    // Configuração bruta do módulo (backlog Tasmota), equivalente a
    // /v2/api/exhausts/config. Só admin: um comando errado desconfigura o
    // relé de uma torre inteira.
    typedApp.post('/exhausts/modules/:modulo/config', {
        onRequest: [requireAuth, requireRole('admin')],
        schema: {
            params: configParamsSchema,
            body: configBodySchema,
            response: { 200: successResponseSchema(z.unknown()) },
        },
    }, async (request, reply) => {
        const { modulo } = request.params;
        try {
            const result = await configureExhaustModule(modulo, request.body.comando);
            logger.info(`[ApiV3] Módulo de exaustor ${modulo} configurado por ${request.actor!.id}`);
            return reply.ok(result ?? null);
        } catch (error) {
            logger.error(`[ApiV3] Falha ao configurar módulo de exaustor ${modulo}:`, error);
            return reply.fail({ type: 'upstream-error', detail: 'Falha ao configurar o módulo.', instance: request.url });
        }
    });
}
