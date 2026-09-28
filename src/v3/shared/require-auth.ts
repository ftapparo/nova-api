import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import logger from '../../core/utils/logger';

// =============================================================================
// Autenticação de usuário na v3: valida localmente o access token emitido
// pelo Supabase Auth (GoTrue), sem chamar o serviço de auth a cada
// requisição. O GoTrue assina com HS256 usando o segredo compartilhado
// (GOTRUE_JWT_SECRET no container nova-auth == AUTH_JWT_SECRET aqui).
//
// Consequência de validar localmente: logout revoga só o refresh token; um
// access token já emitido continua válido até expirar (GOTRUE_JWT_EXP=900,
// 15 min). É o trade-off aceito no desenho da Etapa 2.
//
// Implementado com node:crypto em vez de `jose`: o jose v6 é ESM-only e
// este projeto compila para CommonJS em Node 20, e HS256 é um único HMAC.
// =============================================================================

// Papéis da aplicação. A autorização é responsabilidade da API, não do
// Supabase Auth — o papel é gravado em app_metadata.role pelo processo
// administrativo de criação de conta (app_metadata só é editável via API
// admin, nunca pelo próprio usuário).
export const APP_ROLES = ['morador', 'portaria', 'sindico', 'admin', 'servico'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export type Actor = {
    id: string;
    email: string | null;
    role: AppRole | null;
};

declare module 'fastify' {
    interface FastifyRequest {
        /** Usuário autenticado, extraído do access token. Ausente em rota pública. */
        actor?: Actor;
    }
}

// Audiência fixa configurada no nova-auth (GOTRUE_JWT_AUD).
const EXPECTED_AUDIENCE = 'authenticated';

// Tolerância de relógio para `exp`. Auth e API rodam no mesmo host, então
// basta uma margem pequena.
const CLOCK_SKEW_SECONDS = 5;

// Lida dentro da função (não no topo do módulo): imports são resolvidos
// antes de dotenv.config() rodar em server.ts.
const resolveJwtSecret = (): string => process.env.AUTH_JWT_SECRET ?? '';

export const toAppRole = (value: unknown): AppRole | null =>
    typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value) ? (value as AppRole) : null;

const decodeSegment = (segment: string): Record<string, unknown> | null => {
    try {
        const parsed = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
};

/**
 * Verifica assinatura, algoritmo, expiração e audiência do token. Retorna
 * o ator ou null — o motivo da recusa nunca vai para o cliente.
 */
export function verifyAccessToken(token: string): Actor | null {
    const secret = resolveJwtSecret();
    if (!secret) {
        // Sem segredo não há como validar nada: falha fechada, nunca aberta.
        logger.error('[ApiV3] AUTH_JWT_SECRET ausente — todo token será recusado.');
        return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    const header = decodeSegment(encodedHeader);
    // Algoritmo fixado aqui, nunca lido do token como fonte de verdade —
    // evita ataques de troca de algoritmo (ex.: "alg": "none").
    if (!header || header.alg !== 'HS256') return null;

    const expected = createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest();
    const received = Buffer.from(encodedSignature, 'base64url');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

    const payload = decodeSegment(encodedPayload);
    if (!payload) return null;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < nowSeconds) return null;

    const audience = payload.aud;
    const audienceOk = Array.isArray(audience) ? audience.includes(EXPECTED_AUDIENCE) : audience === EXPECTED_AUDIENCE;
    if (!audienceOk) return null;

    if (typeof payload.sub !== 'string' || !payload.sub) return null;

    const appMetadata = (payload.app_metadata ?? {}) as Record<string, unknown>;
    return {
        id: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : null,
        role: toAppRole(appMetadata.role),
    };
}

export const extractBearerToken = (request: FastifyRequest): string | null => {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

// Mensagem genérica de propósito: não revela se faltou token, se expirou
// ou se a assinatura não bateu (ver AGENTS.md, seção Error Handling).
const sendUnauthorized = (request: FastifyRequest, reply: FastifyReply) =>
    reply.fail({ type: 'unauthorized', detail: 'Não autorizado.', instance: request.url });

/**
 * Hook estrito: exige access token válido sempre, independente de
 * AUTH_ENFORCE. Para rotas que só fazem sentido com sessão (logout, /me).
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    const token = extractBearerToken(request);
    const actor = token ? verifyAccessToken(token) : null;
    if (!actor) return sendUnauthorized(request, reply);
    request.actor = actor;
}

/**
 * Hook de autorização por papel. Registrar depois de requireAuth (ou
 * enforceAuth), que é quem preenche `request.actor`. Sem ator ou sem papel
 * atribuído = 403, nunca passa.
 */
export const requireRole = (...allowed: AppRole[]) =>
    async function (request: FastifyRequest, reply: FastifyReply) {
        const role = request.actor?.role;
        if (!role || !allowed.includes(role)) {
            return reply.fail({ type: 'forbidden', detail: 'Acesso negado.', instance: request.url });
        }
    };

/**
 * Hook das rotas de negócio. Com AUTH_ENFORCE=false (período de corte,
 * CHECKLIST §2.5), requisição sem token válido passa sem `actor`, para o
 * FRONT poder começar a enviar token antes de a exigência ser ligada.
 *
 * Padrão é exigir: só a string exata 'false' desliga. O flag precisa ser
 * removido depois do corte — flag esquecido vira porta dos fundos.
 */
export async function enforceAuth(request: FastifyRequest, reply: FastifyReply) {
    const token = extractBearerToken(request);
    const actor = token ? verifyAccessToken(token) : null;

    if (actor) {
        request.actor = actor;
        return;
    }

    if (process.env.AUTH_ENFORCE === 'false') {
        logger.warn(`[ApiV3] Requisição sem token válido aceita (AUTH_ENFORCE=false): ${request.method} ${request.url}`);
        return;
    }

    return sendUnauthorized(request, reply);
}
