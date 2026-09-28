import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import { successResponseSchema } from '../shared/response';
import { requireAuth, requireRole } from '../shared/require-auth';
import { linkBodySchema, linkParamsSchema, linkSchema, residenceSchema } from './residence.schema';
import * as residenceService from './residence.service';

// Vínculo conta ↔ cadastro de pessoa no Firebird, e a situação residencial
// derivada dele. requireAuth explícito em toda rota (além do enforceAuth do
// escopo): estas rotas dependem de request.actor mesmo com AUTH_ENFORCE=false.

const toLinkResponse = (link: { accountId: string; personSeq: number; linkedBy: string; linkedAt: Date }) => ({
    accountId: link.accountId,
    personSequencia: link.personSeq,
    linkedBy: link.linkedBy,
    linkedAt: link.linkedAt.toISOString(),
});

export async function residenceRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();
    const adminOnly = [requireAuth, requireRole('admin')];

    // Chamado pelo app logo após o login: define o que fica liberado.
    typedApp.get('/residence/me', {
        onRequest: requireAuth,
        schema: { response: { 200: successResponseSchema(residenceSchema) } },
    }, async (request, reply) => reply.ok(await residenceService.getResidence(request.actor!.id)));

    typedApp.get('/residence/links', {
        onRequest: adminOnly,
        schema: { response: { 200: successResponseSchema(z.array(linkSchema)) } },
    }, async (_request, reply) => reply.ok((await residenceService.listLinks()).map(toLinkResponse)));

    typedApp.put('/residence/links/:accountId', {
        onRequest: adminOnly,
        schema: {
            params: linkParamsSchema,
            body: linkBodySchema,
            response: { 200: successResponseSchema(linkSchema) },
        },
    }, async (request, reply) => {
        const { accountId } = request.params;
        const { personSequencia } = request.body;
        const result = await residenceService.linkAccount(accountId, personSequencia, request.actor!.id);

        if (!result.ok) {
            return result.reason === 'person-not-found'
                ? reply.fail({ type: 'not-found', detail: 'Pessoa não encontrada no cadastro do condomínio.', instance: request.url })
                : reply.fail({ type: 'conflict', detail: 'Esta pessoa já está vinculada a outra conta.', instance: request.url });
        }

        logger.info(`[ApiV3] Conta ${accountId} vinculada à pessoa ${personSequencia} por ${request.actor!.id}`);
        return reply.ok(toLinkResponse(result.link));
    });

    typedApp.delete('/residence/links/:accountId', {
        onRequest: adminOnly,
        schema: {
            params: linkParamsSchema,
            response: { 200: successResponseSchema(z.null()) },
        },
    }, async (request, reply) => {
        const removed = await residenceService.unlinkAccount(request.params.accountId);
        if (!removed) return reply.fail({ type: 'not-found', detail: 'Conta sem vínculo.', instance: request.url });

        logger.info(`[ApiV3] Vínculo da conta ${request.params.accountId} removido por ${request.actor!.id}`);
        return reply.ok(null);
    });
}
