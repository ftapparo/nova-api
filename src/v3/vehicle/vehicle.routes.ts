import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import {
    deleteTagByVehicleSeq,
    getVehicleByPlate,
    listAccessByVehicle,
    listVehiclesByOwner,
    unlinkOwnerByVehicleSeq,
    upsertVehicleByPlate,
} from '../../core/repositories/vehicle-v2.repository';
import { AccessCredentialError, isValidCpf, isValidTag, normalizePlate, sanitizeDigits } from '../../core/services/access-credential';
import { successResponseSchema } from '../shared/response';
import { requireAuth, requireRole } from '../shared/require-auth';
import { AttemptLimiter } from '../shared/attempt-limiter';
import { linkTag, lookupPlate } from './vehicle.service';

// =============================================================================
// Cadastro de veículos e TAG veicular no Freedom (Firebird), equivalente ao
// fluxo /v2/api/vehicles/* do vehicles-v2 (tela Veículos do painel). Só
// equipe. As rotas legadas de /v2/api/vehicles (CRUD, foto, lock/unlock,
// purge) não têm consumidor e não foram migradas.
// =============================================================================

const staffOnly = [requireAuth, requireRole('porteiro', 'sindico', 'admin')];

// A consulta externa abre um Chromium (Puppeteer) ou chama API paga por
// placa: limite por conta bem menor que o dos comandos.
const lookupsByAccount = new AttemptLimiter(5, 60 * 1000);

const plateSchema = z.string().trim().transform(normalizePlate).pipe(z.string().regex(/^[A-Z0-9]{7}$/, 'Placa inválida.'));
const vehicleSeqParams = z.object({ vehicleSeq: z.coerce.number().int().positive() });
const anyData = successResponseSchema(z.unknown());

const firebirdFailure = (request: FastifyRequest, reply: FastifyReply, what: string, error: unknown) => {
    logger.error(`[ApiV3] Falha ao ${what}:`, error);
    return reply.fail({ type: 'upstream-error', detail: `Falha ao ${what}.`, instance: request.url });
};

export async function vehicleRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get('/vehicles', {
        onRequest: staffOnly,
        schema: {
            querystring: z.object({ ownerSeq: z.coerce.number().int().positive() }),
            response: { 200: anyData },
        },
    }, async (request, reply) => {
        try {
            return reply.ok(await listVehiclesByOwner(request.query.ownerSeq));
        } catch (error) {
            return firebirdFailure(request, reply, 'listar veículos', error);
        }
    });

    typedApp.get('/vehicles/plate/:plate', {
        onRequest: staffOnly,
        schema: { params: z.object({ plate: plateSchema }), response: { 200: anyData } },
    }, async (request, reply) => {
        try {
            const vehicle = await getVehicleByPlate(request.params.plate);
            if (!vehicle) return reply.ok({ exists: false, vehicle: null, accessTag: null });
            const accessRows = await listAccessByVehicle(Number(vehicle.SEQUENCIA));
            return reply.ok({ exists: true, vehicle, accessTag: accessRows[0] ?? null });
        } catch (error) {
            return firebirdFailure(request, reply, 'consultar placa', error);
        }
    });

    typedApp.post('/vehicles/plate/lookup', {
        onRequest: staffOnly,
        schema: {
            body: z.object({ plate: plateSchema, provider: z.enum(['API1', 'API2', 'API3']).optional() }),
            response: { 200: anyData },
        },
    }, async (request, reply) => {
        const accountId = request.actor!.id;
        const retryAfter = lookupsByAccount.retryAfter(accountId);
        if (retryAfter > 0) {
            reply.header('Retry-After', String(retryAfter));
            return reply.fail({ type: 'rate-limited', detail: 'Muitas consultas. Tente novamente em instantes.', instance: request.url });
        }
        lookupsByAccount.hit(accountId);

        try {
            const outcome = await lookupPlate(request.body.plate, request.body.provider ?? null);
            return outcome.kind === 'already-linked'
                ? reply.fail({ type: 'conflict', detail: outcome.detail, instance: request.url })
                : reply.ok(outcome.data);
        } catch (error) {
            logger.error('[ApiV3] Falha no lookup externo de placa:', error);
            return reply.fail({ type: 'upstream-error', detail: 'Falha ao consultar fontes externas da placa.', instance: request.url });
        }
    });

    typedApp.put('/vehicles/plate/:plate', {
        onRequest: staffOnly,
        schema: {
            params: z.object({ plate: plateSchema }),
            body: z.object({
                brand: z.string().trim().max(60).nullish(),
                model: z.string().trim().max(60).nullish(),
                color: z.string().trim().max(40).nullish(),
                ownerSeq: z.number().int().positive(),
                unitSeq: z.number().int().positive().nullish(),
            }),
            response: { 200: anyData },
        },
    }, async (request, reply) => {
        const { brand, model, color, ownerSeq, unitSeq } = request.body;
        try {
            return reply.ok(await upsertVehicleByPlate({
                plate: request.params.plate,
                brand: brand || null,
                model: model || null,
                color: color || null,
                ownerSeq,
                unitSeq: unitSeq ?? null,
            }));
        } catch (error) {
            return firebirdFailure(request, reply, 'salvar veículo', error);
        }
    });

    typedApp.put('/vehicles/:vehicleSeq/tag', {
        onRequest: staffOnly,
        schema: {
            params: vehicleSeqParams,
            body: z.object({
                cpf: z.string().trim().transform(sanitizeDigits).refine(isValidCpf, 'CPF inválido.'),
                tag: z.string().trim().transform(sanitizeDigits).refine(isValidTag, 'Tag inválida. Informe 10 dígitos.'),
                // Portão usado para conferir se o CPF está liberado.
                numeroDispositivo: z.number().int().positive(),
                forceSwap: z.boolean().default(false),
            }),
            response: { 200: anyData },
        },
    }, async (request, reply) => {
        try {
            const outcome = await linkTag({ vehicleSeq: request.params.vehicleSeq, ...request.body, actor: request.actor! });
            switch (outcome.kind) {
                case 'ok':
                    return reply.ok({ status: outcome.status, vehicleSeq: outcome.vehicleSeq, tag: outcome.tag });
                case 'forbidden':
                    return reply.fail({ type: 'forbidden', detail: 'CPF sem permissão para autorizar tag de veículo.', instance: request.url });
                case 'owner-unknown':
                    return reply.fail({ type: 'validation-error', detail: 'Não foi possível identificar o proprietário para vínculo.', instance: request.url });
                case 'tag-in-use':
                    return reply.fail({ type: 'conflict', detail: 'Tag já vinculada a outro veículo.', instance: request.url });
                case 'needs-confirmation':
                    // O app reenvia com forceSwap: true depois de o operador confirmar a troca.
                    return reply.fail({
                        type: 'conflict',
                        title: 'Confirmação necessária',
                        detail: `Veículo já possui a tag ${outcome.currentTag ?? ''}. Confirme para trocar.`.replace('  ', ' '),
                        instance: request.url,
                    });
            }
        } catch (error) {
            if (error instanceof AccessCredentialError && error.status === 404) {
                return reply.fail({ type: 'not-found', detail: error.message, instance: request.url });
            }
            return firebirdFailure(request, reply, 'vincular tag', error);
        }
    });

    typedApp.delete('/vehicles/:vehicleSeq/tag', {
        onRequest: staffOnly,
        schema: { params: vehicleSeqParams, response: { 200: anyData } },
    }, async (request, reply) => {
        try {
            return reply.ok(await deleteTagByVehicleSeq(request.params.vehicleSeq));
        } catch (error) {
            return firebirdFailure(request, reply, 'remover tag do veículo', error);
        }
    });

    typedApp.delete('/vehicles/:vehicleSeq/owner', {
        onRequest: staffOnly,
        schema: { params: vehicleSeqParams, response: { 200: anyData } },
    }, async (request, reply) => {
        try {
            return reply.ok(await unlinkOwnerByVehicleSeq(request.params.vehicleSeq));
        } catch (error) {
            return firebirdFailure(request, reply, 'desvincular proprietário do veículo', error);
        }
    });
}
