import { randomInt } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import { findLinkByPerson } from '../../core/repositories/residence.repository';
import { successResponseSchema } from '../shared/response';
import { requireAuth, requireRole, type Actor, type AppRole } from '../shared/require-auth';
import {
    changePasswordBodySchema,
    recoverBodySchema,
    recoverConfirmBodySchema,
    sessionDataSchema,
    staffResetPasswordBodySchema,
    temporaryPasswordSchema,
} from './auth.schema';
import * as authService from './auth.service';
import {
    normalizeEmailKey,
    passwordChangeFailuresByAccount,
    recoverByEmail,
    recoverByIp,
    recoverCodeFailuresByEmail,
    resolveClientIp,
} from './auth.rate-limit';

// =============================================================================
// Senha: reset pela equipe (senha provisória), troca pelo próprio usuário e
// recuperação por e-mail com código de 6 dígitos.
// =============================================================================

// Sem caracteres ambíguos (0/O, 1/l/I): a senha provisória é ditada ou
// digitada a partir da tela do porteiro.
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const TEMP_PASSWORD_LENGTH = 10;

const generateTemporaryPassword = (): string =>
    Array.from({ length: TEMP_PASSWORD_LENGTH }, () => TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)]).join('');

// Hierarquia do reset: quem recebe a senha provisória assume a conta, então
// ninguém reseta conta de nível igual ou maior que o seu — senão o porteiro
// tomaria a conta de um admin. Admin reseta qualquer uma.
const ROLE_RANK: Record<AppRole, number> = { morador: 0, porteiro: 1, sindico: 2, admin: 3 };
const rankOf = (role: AppRole | null) => (role ? ROLE_RANK[role] : 0);
const canReset = (actor: Actor, targetRole: AppRole | null) =>
    actor.role === 'admin' || rankOf(actor.role) > rankOf(targetRole);

const fail = (request: FastifyRequest, reply: FastifyReply, failure: { reason: string; detail?: string }) => {
    if (failure.reason === 'rejected') {
        return reply.fail({ type: 'validation-error', detail: failure.detail ?? 'Senha recusada pelo serviço de autenticação.', instance: request.url });
    }
    if (failure.reason === 'rate-limited') {
        return reply.fail({ type: 'rate-limited', detail: 'Muitas tentativas. Tente novamente mais tarde.', instance: request.url });
    }
    return reply.fail({ type: 'upstream-error', detail: 'Serviço de autenticação indisponível.', instance: request.url, status: 503 });
};

const tooManyAttempts = (request: FastifyRequest, reply: FastifyReply, retryAfterSeconds: number) => {
    reply.header('Retry-After', String(retryAfterSeconds));
    return reply.fail({ type: 'rate-limited', detail: 'Muitas tentativas. Tente novamente mais tarde.', instance: request.url });
};

/**
 * Depois de a senha definitiva ser gravada: remove a marca de senha
 * provisória e abre uma sessão nova, cujo token já não carrega a marca.
 */
const finishPasswordChange = async (
    request: FastifyRequest,
    reply: FastifyReply,
    accountId: string,
    email: string,
    newPassword: string,
) => {
    const cleared = await authService.adminUpdateUser(accountId, { appMetadata: { must_change_password: null } });
    if (!cleared.ok) return fail(request, reply, cleared);

    const session = await authService.login(email, newPassword);
    if (!session.ok) return fail(request, reply, session);
    return reply.ok(session.data);
};

// O GoTrue busca o template por URL (GOTRUE_MAILER_TEMPLATES_RECOVERY) na
// rede interna. Código em vez de link: o link padrão apontaria para o
// próprio GoTrue, que não é exposto. {{ .Token }} é o código de 6 dígitos.
const RECOVERY_EMAIL_TEMPLATE = `<!doctype html>
<html lang="pt-BR">
<body style="font-family: Arial, sans-serif; color: #1f2937;">
  <h2>Condomínio Nova Residence</h2>
  <p>Recebemos um pedido para redefinir a senha da sua conta.</p>
  <p>Seu código de recuperação é:</p>
  <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px;">{{ .Token }}</p>
  <p>Digite o código no aplicativo para escolher uma nova senha. Ele vale por 15 minutos.</p>
  <p>Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.</p>
</body>
</html>`;

export async function passwordRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    // Reset pela equipe: gera e devolve uma senha provisória, que precisa
    // ser trocada no próximo login (imposto pela API, ver require-auth).
    typedApp.post('/auth/password/staff-reset', {
        onRequest: [requireAuth, requireRole('porteiro', 'sindico', 'admin')],
        schema: {
            body: staffResetPasswordBodySchema,
            response: { 200: successResponseSchema(temporaryPasswordSchema) },
        },
    }, async (request, reply) => {
        const actor = request.actor!;
        let accountId = request.body.accountId;
        if (!accountId) {
            const link = await findLinkByPerson(request.body.personSequencia!);
            if (!link) return reply.fail({ type: 'not-found', detail: 'Nenhuma conta vinculada a esta pessoa.', instance: request.url });
            accountId = link.accountId;
        }

        const target = await authService.getUser(accountId);
        if (!target.ok) {
            return target.reason === 'not-found'
                ? reply.fail({ type: 'not-found', detail: 'Conta não encontrada.', instance: request.url })
                : fail(request, reply, target);
        }
        if (!canReset(actor, target.data.role)) {
            return reply.fail({ type: 'forbidden', detail: 'Acesso negado.', instance: request.url });
        }

        const temporaryPassword = generateTemporaryPassword();
        const updated = await authService.adminUpdateUser(accountId, {
            password: temporaryPassword,
            appMetadata: { must_change_password: true },
        });
        if (!updated.ok) return fail(request, reply, updated);

        // Nunca logar a senha provisória — só quem resetou e de quem.
        logger.info(`[ApiV3] Senha da conta ${accountId} resetada por ${actor.id} (${actor.role})`);
        return reply.ok({ accountId, email: target.data.email, temporaryPassword });
    });

    // Troca pelo próprio usuário — inclusive saindo da senha provisória.
    typedApp.post('/auth/password/change', {
        onRequest: requireAuth,
        config: { allowPendingPasswordChange: true },
        schema: {
            body: changePasswordBodySchema,
            response: { 200: successResponseSchema(sessionDataSchema) },
        },
    }, async (request, reply) => {
        const actor = request.actor!;
        const { currentPassword, newPassword } = request.body;
        if (!actor.email) return reply.fail({ type: 'validation-error', detail: 'Conta sem e-mail.', instance: request.url });

        const retryAfter = passwordChangeFailuresByAccount.retryAfter(actor.id);
        if (retryAfter > 0) return tooManyAttempts(request, reply, retryAfter);

        // Confirma a senha atual abrindo uma sessão com ela; o token dessa
        // sessão é o que autoriza o PUT /user no GoTrue.
        const current = await authService.login(actor.email, currentPassword);
        if (!current.ok) {
            if (current.reason === 'invalid-credentials') {
                passwordChangeFailuresByAccount.hit(actor.id);
                return reply.fail({ type: 'unauthorized', detail: 'Senha atual incorreta.', instance: request.url });
            }
            return fail(request, reply, current);
        }
        passwordChangeFailuresByAccount.reset(actor.id);

        const changed = await authService.updateOwnPassword(current.data.accessToken, newPassword);
        if (!changed.ok) return fail(request, reply, changed);

        logger.info(`[ApiV3] Senha trocada pela própria conta ${actor.id}`);
        return finishPasswordChange(request, reply, actor.id, actor.email, newPassword);
    });

    // Recuperação, passo 1: envia o código por e-mail. Resposta sempre igual,
    // exista a conta ou não — não revela quais e-mails têm cadastro.
    typedApp.post('/auth/password/recover', {
        schema: {
            body: recoverBodySchema,
            response: { 202: successResponseSchema(z.null()) },
        },
    }, async (request, reply) => {
        const ip = resolveClientIp(request);
        const emailKey = normalizeEmailKey(request.body.email);
        const retryAfter = Math.max(recoverByIp.retryAfter(ip), recoverByEmail.retryAfter(emailKey));
        if (retryAfter > 0) return tooManyAttempts(request, reply, retryAfter);
        recoverByIp.hit(ip);
        recoverByEmail.hit(emailKey);

        const result = await authService.requestRecovery(request.body.email);
        // Falha "de credencial" do GoTrue (ex.: e-mail inexistente) também
        // responde 202; só indisponibilidade real vira erro.
        if (!result.ok && result.reason !== 'invalid-credentials') return fail(request, reply, result);
        return reply.ok(null, { status: 202 });
    });

    // Recuperação, passo 2: código do e-mail + nova senha.
    typedApp.post('/auth/password/recover/confirm', {
        schema: {
            body: recoverConfirmBodySchema,
            response: { 200: successResponseSchema(sessionDataSchema) },
        },
    }, async (request, reply) => {
        const { email, code, newPassword } = request.body;
        const emailKey = normalizeEmailKey(email);
        const retryAfter = recoverCodeFailuresByEmail.retryAfter(emailKey);
        if (retryAfter > 0) return tooManyAttempts(request, reply, retryAfter);

        const session = await authService.verifyRecoveryCode(email, code);
        if (!session.ok) {
            if (session.reason === 'invalid-credentials') {
                recoverCodeFailuresByEmail.hit(emailKey);
                return reply.fail({ type: 'unauthorized', detail: 'Código inválido ou expirado.', instance: request.url });
            }
            return fail(request, reply, session);
        }
        recoverCodeFailuresByEmail.reset(emailKey);

        const changed = await authService.updateOwnPassword(session.data.accessToken, newPassword);
        if (!changed.ok) return fail(request, reply, changed);

        logger.info(`[ApiV3] Senha redefinida por código de recuperação: ${session.data.user.id}`);
        return finishPasswordChange(request, reply, session.data.user.id, email, newPassword);
    });

    // Template do e-mail de recuperação, buscado pelo GoTrue. Público e
    // estático (não tem dado nenhum), fora do envelope JSON de propósito.
    app.get('/auth/email-templates/recovery', async (_request, reply) =>
        reply.type('text/html; charset=utf-8').send(RECOVERY_EMAIL_TEMPLATE));
}
