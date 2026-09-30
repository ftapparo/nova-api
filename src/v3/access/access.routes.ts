import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import { insertAccess, listRecentAccessByDevice, verifyAccessById } from '../../core/repositories/access.repository';
import { AccessCredentialError, resolveAccessCredential } from '../../core/services/access-credential';
import { successResponseSchema } from '../shared/response';
import { requireAuth, requireRole } from '../shared/require-auth';
import { requireRoleOrService } from '../shared/service-auth';

// =============================================================================
// Controle de acesso do Freedom (Firebird), equivalente a /v2/api/access/*.
// - recent: histórico de passagens por portão (card do painel).
// - verify/register: a portaria confere e registra acesso manual; o TAG faz
//   o mesmo a cada TAG lida (chamada de serviço, API_SERVICE_TOKEN).
// Nomes de campo do register mantidos iguais aos da v2: são as colunas da
// procedure/tabela do ERP, e o TAG monta o corpo a partir do verify.
// =============================================================================

const STAFF = ['porteiro', 'sindico', 'admin'] as const;
const staffOnly = [requireAuth, requireRole(...STAFF)];
const staffOrService = requireRoleOrService(...STAFF);

const upperText = (allowed: readonly [string, ...string[]]) =>
    z.string().trim().transform((value) => value.toUpperCase()).pipe(z.enum(allowed));
const text = z.string().trim().min(1);

const registerBodySchema = z.object({
    dispositivo: z.coerce.number().int().positive(),
    pessoa: z.coerce.number().int(),
    classificacao: z.coerce.number().int(),
    classAutorizado: upperText(['S', 'N']),
    autorizacaoLanc: text,
    origem: text,
    seqIdAcesso: z.coerce.number().int(),
    sentido: upperText(['E', 'S']),
    quadra: text,
    lote: text,
    panico: upperText(['S', 'N']),
    formaAcesso: text,
    idAcesso: text,
    seqVeiculo: z.coerce.number().int(),
});

const rowsSchema = successResponseSchema(z.array(z.record(z.string(), z.unknown())));

const firebirdFailure = (request: FastifyRequest, reply: FastifyReply, what: string, error: unknown) => {
    logger.error(`[ApiV3] Falha ao ${what}:`, error);
    return reply.fail({ type: 'upstream-error', detail: `Falha ao ${what}.`, instance: request.url });
};

export async function accessRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get('/access/recent', {
        onRequest: staffOnly,
        schema: {
            querystring: z.object({
                numeroDispositivo: z.coerce.number().int().positive(),
                limit: z.coerce.number().int().min(1).max(50).default(10),
            }),
            response: { 200: rowsSchema },
        },
    }, async (request, reply) => {
        try {
            const { numeroDispositivo, limit } = request.query;
            return reply.ok(await listRecentAccessByDevice(numeroDispositivo, limit));
        } catch (error) {
            return firebirdFailure(request, reply, 'listar acessos', error);
        }
    });

    typedApp.get('/access/verify', {
        onRequest: staffOrService,
        config: { allowServiceToken: true },
        schema: {
            querystring: z.object({
                id: z.string().trim().min(1),
                numeroDispositivo: z.coerce.number().int().positive(),
                sentido: upperText(['E', 'S']),
                foto: z.string().optional(),
            }),
            response: { 200: rowsSchema },
        },
    }, async (request, reply) => {
        const { id, numeroDispositivo, sentido, foto } = request.query;
        try {
            const credential = await resolveAccessCredential(id);
            return reply.ok(await verifyAccessById(credential, numeroDispositivo, foto ?? null, sentido));
        } catch (error) {
            if (error instanceof AccessCredentialError) {
                return error.status === 404
                    ? reply.fail({ type: 'not-found', detail: error.message, instance: request.url })
                    : reply.fail({
                        type: 'validation-error',
                        detail: error.message,
                        instance: request.url,
                        validationErrors: [{ path: '/id', message: error.message }],
                    });
            }
            return firebirdFailure(request, reply, 'verificar acesso', error);
        }
    });

    typedApp.post('/access/register', {
        onRequest: staffOrService,
        config: { allowServiceToken: true },
        schema: {
            body: registerBodySchema,
            response: { 201: successResponseSchema(z.record(z.string(), z.unknown())) },
        },
    }, async (request, reply) => {
        try {
            const result = await insertAccess(request.body);
            return reply.ok(result, { status: 201 });
        } catch (error) {
            return firebirdFailure(request, reply, 'registrar acesso', error);
        }
    });
}
