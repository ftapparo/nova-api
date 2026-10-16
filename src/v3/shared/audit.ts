import { isIP } from 'node:net';
import type { FastifyReply, FastifyRequest } from 'fastify';
import logger from '../../core/utils/logger';
import { insertAuditEvent, pruneAuditEvents } from '../../core/repositories/audit.repository';

// =============================================================================
// Registro de atividades no Postgres (audit_event). Uma linha por escrita
// (POST/PUT/PATCH/DELETE) da v3, gravada pelo hook onResponse em todos os
// escopos (inclusive login e cadastro), mais eventos com motivo gravados pela
// própria rota (ex.: tentativa de vínculo automático).
//
// A rota pode enriquecer a linha da requisição com `request.audit` (conta,
// ação semântica, alvo, resultado, detalhes). Nada de CPF, celular, senha,
// token, código, localização ou conteúdo: só ids e motivos.
//
// Leituras ficam de fora: o app consulta central e exaustor a cada poucos
// segundos e isso viraria milhões de linhas sem valor. O arquivo de comandos
// (command-audit.ts, histórico da portaria) continua igual.
// =============================================================================

export type AuditContext = {
    /** Conta da ação quando a rota é pública (ex.: login bem-sucedido). */
    accountId?: string | null;
    /** Nome semântico no lugar de "MÉTODO /rota" (ex.: "residence.self_link.check"). */
    action?: string;
    target?: Record<string, unknown>;
    /** Motivo no lugar do resultado derivado do status (ex.: "mismatch"). */
    outcome?: string;
    details?: Record<string, unknown>;
};

declare module 'fastify' {
    interface FastifyRequest {
        audit?: AuditContext;
    }
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Escritas técnicas, sem ação do usuário: ticket do WebSocket (a cada conexão)
// e renovação do token (a cada ~15 min de app aberto).
const IGNORED_PREFIXES = ['/v3/api/ws/', '/v3/api/auth/refresh'];

const outcomeFor = (status: number): string => {
    if (status < 400) return 'ok';
    if (status === 401 || status === 403) return 'denied';
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'error';
    return 'rejected';
};

const actorRole = (request: FastifyRequest): string | null => {
    if (request.actor) return request.actor.role ?? 'conta';
    if (request.serviceCaller) {
        const name = String(request.headers['x-service-name'] ?? '').trim().toLowerCase();
        return /^[a-z0-9-]{1,20}$/.test(name) ? `servico:${name}` : 'servico';
    }
    return null;
};

const record = (request: FastifyRequest, action: string, outcome: string, status: number | null, context?: AuditContext) => {
    const params = request.params && typeof request.params === 'object' && Object.keys(request.params).length > 0
        ? request.params as Record<string, unknown>
        : null;
    insertAuditEvent({
        accountId: request.actor?.id ?? context?.accountId ?? null,
        actorRole: actorRole(request),
        action,
        target: context?.target ?? params,
        outcome,
        httpStatus: status,
        requestId: (request.headers['x-request-id'] as string | undefined) ?? request.id ?? null,
        ip: request.ip && isIP(request.ip) ? request.ip : null,
        appVersion: (request.headers['x-app-version'] as string | undefined) ?? null,
        details: context?.details ?? null,
    }).catch((error) => {
        // A auditoria nunca derruba a requisição: a falha fica no log de arquivo.
        logger.warn(`[ApiV3 Audit] Falha ao gravar ${action}: ${error instanceof Error ? error.message : error}`);
    });
};

/** Hook onResponse: uma linha por escrita da v3. */
export async function auditRequest(request: FastifyRequest, reply: FastifyReply) {
    const method = request.method.toUpperCase();
    if (!WRITE_METHODS.has(method)) return;
    const route = request.routeOptions.url;
    if (!route) return;
    if (IGNORED_PREFIXES.some((prefix) => route.startsWith(prefix))) return;
    const context = request.audit;
    record(request, context?.action ?? `${method} ${route}`, context?.outcome ?? outcomeFor(reply.statusCode), reply.statusCode, context);
}

/** Evento avulso, fora da linha da requisição (ex.: um passo intermediário). */
export const auditEvent = (request: FastifyRequest, action: string, outcome: string, context?: AuditContext) =>
    record(request, action, outcome, null, context);

const retentionDays = (): number => {
    const value = Number(process.env.AUDIT_RETENTION_DAYS);
    return Number.isFinite(value) && value >= 30 ? Math.floor(value) : 365;
};

/** Limpeza diária das linhas mais antigas que a retenção. */
export const startAuditRetention = (): void => {
    const prune = () => pruneAuditEvents(retentionDays())
        .catch((error) => logger.error('[ApiV3 Audit] Falha na limpeza do registro de atividades:', error));
    setTimeout(prune, 60_000).unref();
    setInterval(prune, 24 * 60 * 60_000).unref();
};
