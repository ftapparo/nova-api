import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { enforceAuth, requireAuth, requireRole, type StaffRole } from './require-auth';

// =============================================================================
// Chamadas de serviço para a nova-api (TAG validando TAG lida, CIE
// disparando push de alarme): token fixo API_SERVICE_TOKEN, mesmo modelo
// que a nova-api usa para falar com TAG/CIE, no sentido contrário. Só vale
// em rota marcada com config.allowServiceToken — nas demais o token de
// serviço não abre nada.
// =============================================================================

declare module 'fastify' {
    interface FastifyRequest {
        /** true quando a chamada veio de um serviço interno autenticado por token. */
        serviceCaller?: boolean;
    }
    interface FastifyContextConfig {
        /** Rota que aceita, além de usuário, o token de serviço (API_SERVICE_TOKEN). */
        allowServiceToken?: boolean;
    }
}

const extractToken = (headers: IncomingHttpHeaders): string | null => {
    const header = headers.authorization;
    return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
};

// Compara os hashes (mesmo tamanho) em tempo constante.
const tokensMatch = (received: string, expected: string): boolean =>
    timingSafeEqual(createHash('sha256').update(received).digest(), createHash('sha256').update(expected).digest());

/** Sem API_SERVICE_TOKEN configurado, recusa tudo. */
export function hasValidServiceToken(headers: IncomingHttpHeaders): boolean {
    const expected = process.env.API_SERVICE_TOKEN;
    if (!expected) return false;
    const token = extractToken(headers);
    return !!token && tokensMatch(token, expected);
}

/**
 * Hook do escopo protegido: em rota com allowServiceToken, token de serviço
 * válido marca a requisição como serviço; o resto segue pelo enforceAuth.
 */
export async function enforceUserOrService(request: FastifyRequest, reply: FastifyReply) {
    if (request.routeOptions.config?.allowServiceToken && hasValidServiceToken(request.headers)) {
        request.serviceCaller = true;
        return;
    }
    return enforceAuth(request, reply);
}

/** Serviço interno ou usuário autenticado com um dos papéis de equipe. */
export const requireRoleOrService = (...allowed: StaffRole[]) => {
    const roleCheck = requireRole(...allowed);
    return async function (request: FastifyRequest, reply: FastifyReply) {
        if (request.serviceCaller) return;
        await requireAuth(request, reply);
        if (reply.sent) return reply;
        return roleCheck(request, reply);
    };
};
