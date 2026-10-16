import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import { successResponseSchema } from '../shared/response';
import { requireAuth, requireRole } from '../shared/require-auth';
import { AttemptLimiter } from '../shared/attempt-limiter';
import { STAFF_ROLES } from '../../core/repositories/notification.repository';
import { isValidCpf } from '../../core/services/access-credential';
import * as residenceRepository from '../../core/repositories/residence.repository';
import {
    linkBodySchema,
    linkParamsSchema,
    linkSchema,
    residenceSchema,
    selfLinkCheckBodySchema,
    selfLinkCheckSchema,
    selfLinkConfirmBodySchema,
} from './residence.schema';
import * as residenceService from './residence.service';
import { createConfirmation, phoneMatches, takeConfirmation } from './residence.self-link';

// Vínculo automático: só as conferências que falham contam (erro de digitação
// do próprio morador não deve travar quem acerta na segunda vez).
const selfLinkFailuresByAccount = new AttemptLimiter(5, 60 * 60_000);
const selfLinkFailuresByIp = new AttemptLimiter(20, 60 * 60_000);
const NOT_MATCHED = 'Os dados informados não conferem com o cadastro do condomínio.';
const PERSON_TAKEN = 'Esta pessoa já está vinculada a outra conta. Procure a administração.';

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
    // Contas e vínculos: síndico e admin (decisão de 28/09/2026).
    const accountManagers = [requireAuth, requireRole('sindico', 'admin')];

    // Chamado pelo app logo após o login: define o que fica liberado.
    typedApp.get('/residence/me', {
        onRequest: requireAuth,
        schema: { response: { 200: successResponseSchema(residenceSchema) } },
    }, async (request, reply) => reply.ok(await residenceService.getResidence(request.actor!.id)));

    // Vínculo automático pelo próprio morador (07b/07c): CPF + celular conferidos
    // com o Freedom e descartados. A resposta de divergência é a mesma para CPF
    // inexistente, celular diferente ou pessoa sem unidade, para não revelar se
    // um CPF existe no cadastro. Cada tentativa vai para o registro de
    // atividades com o motivo, nunca com o CPF ou o celular.
    typedApp.post('/residence/link/self/check', {
        onRequest: requireAuth,
        schema: { body: selfLinkCheckBodySchema, response: { 200: successResponseSchema(selfLinkCheckSchema) } },
    }, async (request, reply) => {
        const actor = request.actor!;
        const fail = (outcome: string, input: Parameters<typeof reply.fail>[0]) => {
            request.audit = { action: 'residence.self_link.check', outcome };
            return reply.fail(input);
        };
        if (actor.role && (STAFF_ROLES as readonly string[]).includes(actor.role)) {
            return fail('staff', { type: 'forbidden', detail: 'Contas da equipe são vinculadas pela administração.', instance: request.url });
        }
        if (await residenceRepository.findLinkByAccount(actor.id)) {
            return fail('already_linked', { type: 'conflict', detail: 'Esta conta já está vinculada.', instance: request.url });
        }
        const ip = request.ip ?? 'desconhecido';
        const retryAfter = Math.max(selfLinkFailuresByAccount.retryAfter(actor.id), selfLinkFailuresByIp.retryAfter(ip));
        if (retryAfter > 0) {
            reply.header('Retry-After', String(retryAfter));
            return fail('rate_limited', { type: 'rate-limited', detail: 'Muitas tentativas. Tente novamente mais tarde.', instance: request.url });
        }
        const failed = (outcome: string, input: Parameters<typeof reply.fail>[0]) => {
            selfLinkFailuresByAccount.hit(actor.id);
            selfLinkFailuresByIp.hit(ip);
            return fail(outcome, input);
        };

        const cpf = request.body.cpf.replace(/\D/g, '');
        if (!isValidCpf(cpf)) {
            return failed('invalid_cpf', {
                type: 'validation-error', detail: 'CPF inválido.', instance: request.url,
                validationErrors: [{ path: '/cpf', message: 'CPF inválido.' }],
            });
        }
        const { ddi, number } = request.body.phone;
        const matches = (await residenceRepository.findPersonsByCpf(cpf))
            .filter((person) => phoneMatches(person.celular, ddi, number));
        const withUnits: residenceRepository.PersonContactRecord[] = [];
        for (const person of matches) {
            if ((await residenceRepository.findPersonUnits(person.sequencia)).length > 0) withUnits.push(person);
        }
        if (withUnits.length !== 1) {
            // Nenhuma pessoa, ou mais de uma com o mesmo CPF e celular: a administração resolve.
            const outcome = matches.length === 0 ? 'mismatch' : withUnits.length === 0 ? 'no_unit' : 'ambiguous';
            return failed(outcome, { type: 'not-found', detail: NOT_MATCHED, instance: request.url });
        }

        const person = withUnits[0];
        const owner = await residenceRepository.findLinkByPerson(person.sequencia);
        if (owner && owner.accountId !== actor.id) {
            return failed('conflict', { type: 'conflict', detail: PERSON_TAKEN, instance: request.url });
        }
        const units = (await residenceRepository.findPersonUnits(person.sequencia)).map(residenceService.toResidenceUnit);
        request.audit = { action: 'residence.self_link.check', outcome: 'matched', details: { personSeq: person.sequencia } };
        return reply.ok({
            confirmation: createConfirmation(actor.id, person.sequencia),
            person: { nome: person.nome, cpfMasked: residenceService.maskCpf(person.cpf) },
            units,
        });
    });

    typedApp.post('/residence/link/self/confirm', {
        onRequest: requireAuth,
        schema: { body: selfLinkConfirmBodySchema, response: { 200: successResponseSchema(residenceSchema) } },
    }, async (request, reply) => {
        const actor = request.actor!;
        const personSeq = takeConfirmation(actor.id, request.body.confirmation);
        if (personSeq === null) {
            request.audit = { action: 'residence.self_link.confirm', outcome: 'expired' };
            return reply.fail({ type: 'not-found', detail: 'A conferência expirou. Informe os dados novamente.', instance: request.url });
        }
        // linkedBy = a própria conta: é assim que se distingue o autovínculo do feito pela equipe.
        const result = await residenceService.linkAccount(actor.id, personSeq, actor.id);
        if (!result.ok) {
            request.audit = { action: 'residence.self_link.confirm', outcome: result.reason, details: { personSeq } };
            return result.reason === 'person-not-found'
                ? reply.fail({ type: 'not-found', detail: NOT_MATCHED, instance: request.url })
                : reply.fail({ type: 'conflict', detail: PERSON_TAKEN, instance: request.url });
        }
        logger.info(`[ApiV3] Conta ${actor.id} vinculada pelo próprio morador à pessoa ${personSeq}`);
        request.audit = { action: 'residence.self_link.confirm', outcome: 'linked', details: { personSeq } };
        return reply.ok(await residenceService.getResidence(actor.id));
    });

    typedApp.get('/residence/links', {
        onRequest: accountManagers,
        schema: { response: { 200: successResponseSchema(z.array(linkSchema)) } },
    }, async (_request, reply) => reply.ok((await residenceService.listLinks()).map(toLinkResponse)));

    typedApp.put('/residence/links/:accountId', {
        onRequest: accountManagers,
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
        onRequest: accountManagers,
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
