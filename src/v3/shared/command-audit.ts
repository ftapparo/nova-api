import { EventEmitter } from 'node:events';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { appendCommandLog, type CommandLogEntry } from '../../core/services/command-log.service';

// =============================================================================
// Auditoria de comandos da v3 no mesmo arquivo da v2 (core/command-log),
// para GET /commands/logs mostrar as duas superfícies juntas. Diferença
// para a v2: o ator vem do token validado, nunca de x-user (forjável).
// =============================================================================

const COMMAND_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Escritas que não são comando: ticket do WS, preferências e inscrição de
// push (sincronizadas a cada login — encheriam o histórico da portaria).
const IGNORED_PREFIXES = ['/v3/api/ws/', '/v3/api/me/', '/v3/api/push/subscriptions'];

/** Emite 'logged' com cada entrada gravada — consumido pelo WebSocket da v3. */
export const commandLogEvents = new EventEmitter();

// Nome que o serviço declara em x-service-name (tag1, tag2, cie). Só
// identifica no histórico — quem autoriza é o token; nome fora do padrão
// vira só "servico".
const SERVICE_NAME_PATTERN = /^[a-z0-9-]{1,20}$/;

const describeActor = (request: FastifyRequest): string => {
    if (request.actor) return request.actor.email ?? request.actor.id;
    if (request.serviceCaller) {
        const name = String(request.headers['x-service-name'] ?? '').trim().toLowerCase();
        return SERVICE_NAME_PATTERN.test(name) ? `servico:${name}` : 'servico';
    }
    return 'desconhecido';
};

export async function auditCommand(request: FastifyRequest, reply: FastifyReply) {
    const method = request.method.toUpperCase();
    if (!COMMAND_METHODS.has(method)) return;
    // Rota inexistente (404 do Fastify) não é comando.
    if (!request.routeOptions.url) return;

    const path = request.url.split('?')[0];
    if (IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix))) return;

    const entry: CommandLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        timestamp: new Date().toISOString(),
        requestId: (request.headers['x-request-id'] as string | undefined) ?? request.id ?? null,
        method,
        path,
        command: `${method} ${path}`,
        status: reply.statusCode,
        actor: describeActor(request),
        ip: request.ip ?? null,
    };

    appendCommandLog(entry);
    commandLogEvents.emit('logged', entry);
}
