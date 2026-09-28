import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { successResponseSchema } from '../shared/response';
import { extractBearerToken, requireAuth, requireRole } from '../shared/require-auth';
import logger from '../../core/utils/logger';
import { authUserSchema, createUserBodySchema, listUsersQuerySchema, loginBodySchema, refreshBodySchema, sessionDataSchema, signupBodySchema } from './auth.schema';
import * as authService from './auth.service';
import { loginByIp, loginFailuresByEmail, normalizeEmailKey, resolveClientIp, signupByIp } from './auth.rate-limit';

// Login/refresh/logout delegados ao Supabase Auth. /login e /refresh são
// públicos por natureza; /logout e /me exigem access token válido sempre,
// mesmo com AUTH_ENFORCE=false. /signup é o cadastro público do morador.
// /users (listar e criar contas) exige síndico ou admin; só admin cria admin. O primeiro
// admin é promovido direto no banco (auth.users.raw_app_meta_data).

const sendAuthFailure = (request: FastifyRequest, reply: FastifyReply, reason: authService.AuthFailure) => {
    if (reason === 'rate-limited') {
        return reply.fail({ type: 'rate-limited', detail: 'Muitas tentativas. Tente novamente em instantes.', instance: request.url });
    }
    if (reason === 'unavailable') {
        return reply.fail({ type: 'upstream-error', detail: 'Serviço de autenticação indisponível.', instance: request.url, status: 503 });
    }
    return reply.fail({ type: 'unauthorized', detail: 'Credenciais inválidas.', instance: request.url });
};

// Retry-After segue o RFC 9110; o app pode usar para mostrar a espera.
const sendTooManyAttempts = (request: FastifyRequest, reply: FastifyReply, retryAfterSeconds: number) => {
    reply.header('Retry-After', String(retryAfterSeconds));
    return reply.fail({ type: 'rate-limited', detail: 'Muitas tentativas. Tente novamente mais tarde.', instance: request.url });
};

const sendCreateUserFailure = (
    request: FastifyRequest,
    reply: FastifyReply,
    failure: { reason: authService.CreateUserFailure; detail?: string },
) => {
    if (failure.reason === 'email-taken') {
        return reply.fail({ type: 'conflict', detail: 'Já existe uma conta com este e-mail.', instance: request.url });
    }
    if (failure.reason === 'rejected') {
        return reply.fail({ type: 'validation-error', detail: failure.detail ?? 'Dados recusados pelo serviço de autenticação.', instance: request.url });
    }
    return reply.fail({ type: 'upstream-error', detail: 'Serviço de autenticação indisponível.', instance: request.url, status: 503 });
};

export async function authRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post('/auth/login', {
        schema: {
            body: loginBodySchema,
            response: { 200: successResponseSchema(sessionDataSchema) },
        },
    }, async (request, reply) => {
        const ip = resolveClientIp(request);
        const emailKey = normalizeEmailKey(request.body.email);
        const retryAfter = Math.max(loginByIp.retryAfter(ip), loginFailuresByEmail.retryAfter(emailKey));
        if (retryAfter > 0) {
            logger.warn(`[ApiV3] Login bloqueado por excesso de tentativas (ip ${ip}).`);
            return sendTooManyAttempts(request, reply, retryAfter);
        }
        loginByIp.hit(ip);

        const result = await authService.login(request.body.email, request.body.password);
        if (!result.ok) {
            // Só credencial errada conta contra o e-mail — falha do próprio
            // serviço de auth não deve bloquear o dono da conta.
            if (result.reason === 'invalid-credentials') loginFailuresByEmail.hit(emailKey);
            return sendAuthFailure(request, reply, result.reason);
        }
        loginFailuresByEmail.reset(emailKey);
        return reply.ok(result.data);
    });

    // Cadastro público. A conta nasce sem papel e sem acesso: fica
    // 'pendente' até um admin vinculá-la ao cadastro de pessoa no Firebird
    // (ver v3/residence/). O que ela pode fazer vem desse vínculo. O signup do GoTrue continua desligado
    // (GOTRUE_DISABLE_SIGNUP=true): a conta é criada pela API admin, para a
    // API seguir sendo a única porta de entrada e o papel nunca vir do cliente.
    typedApp.post('/auth/signup', {
        schema: {
            body: signupBodySchema,
            response: { 201: successResponseSchema(sessionDataSchema) },
        },
    }, async (request, reply) => {
        const ip = resolveClientIp(request);
        const retryAfter = signupByIp.retryAfter(ip);
        if (retryAfter > 0) {
            logger.warn(`[ApiV3] Cadastro bloqueado por excesso de tentativas (ip ${ip}).`);
            return sendTooManyAttempts(request, reply, retryAfter);
        }
        // Conta toda tentativa, inclusive e-mail já existente: também freia
        // o uso do 409 para descobrir quais e-mails têm conta.
        signupByIp.hit(ip);

        const { email, password } = request.body;
        const created = await authService.createUser({ email, password, role: null });
        if (!created.ok) return sendCreateUserFailure(request, reply, created);

        logger.info(`[ApiV3] Conta criada por cadastro público: ${created.data.id}`);

        // Já devolve a sessão, para o app não precisar de um segundo passo.
        const session = await authService.login(email, password);
        if (!session.ok) return sendAuthFailure(request, reply, session.reason);
        return reply.ok(session.data, { status: 201 });
    });

    typedApp.post('/auth/refresh', {
        schema: {
            body: refreshBodySchema,
            response: { 200: successResponseSchema(sessionDataSchema) },
        },
    }, async (request, reply) => {
        const result = await authService.refresh(request.body.refreshToken);
        if (!result.ok) return sendAuthFailure(request, reply, result.reason);
        return reply.ok(result.data);
    });

    typedApp.post('/auth/logout', {
        onRequest: requireAuth,
        schema: {
            response: { 200: successResponseSchema(z.null()) },
        },
    }, async (request, reply) => {
        // requireAuth já garantiu que o header existe e o token é válido.
        const result = await authService.logout(extractBearerToken(request) as string);
        if (!result.ok) return sendAuthFailure(request, reply, result.reason);
        return reply.ok(null);
    });

    typedApp.get('/auth/me', {
        onRequest: requireAuth,
        schema: {
            response: { 200: successResponseSchema(authUserSchema) },
        },
    }, async (request, reply) => reply.ok(request.actor!));

    typedApp.post('/auth/users', {
        onRequest: [requireAuth, requireRole('sindico', 'admin')],
        schema: {
            body: createUserBodySchema,
            response: { 201: successResponseSchema(authUserSchema) },
        },
    }, async (request, reply) => {
        // Síndico gerencia contas, mas não cria admin — senão poderia se
        // promover indiretamente.
        if (request.body.role === 'admin' && request.actor?.role !== 'admin') {
            return reply.fail({ type: 'forbidden', detail: 'Acesso negado.', instance: request.url });
        }

        const result = await authService.createUser(request.body);
        if (result.ok) {
            logger.info(`[ApiV3] Conta criada: ${result.data.id} (papel ${result.data.role}) por ${request.actor?.id}`);
            return reply.ok(result.data, { status: 201 });
        }
        return sendCreateUserFailure(request, reply, result);
    });

    typedApp.get('/auth/users', {
        onRequest: [requireAuth, requireRole('sindico', 'admin')],
        schema: {
            querystring: listUsersQuerySchema,
            response: { 200: successResponseSchema(z.array(authUserSchema.extend({ createdAt: z.string() }))) },
        },
    }, async (request, reply) => {
        const result = await authService.listUsers(request.query.page, request.query.perPage);
        if (!result.ok) return sendAuthFailure(request, reply, result.reason);
        return reply.ok(result.data);
    });
}
