import type { FastifyReply, FastifyRequest } from 'fastify';
import type { StaffRole } from '../shared/require-auth';
import { getResidence } from './residence.service';

/**
 * Libera papéis de equipe listados OU morador com pelo menos uma unidade
 * liberada. Para rotas que o morador também usa (ex.: leitura da CIE).
 * Registrar depois de requireAuth/enforceAuth.
 *
 * Mesma exceção de requireRole: sem ator com AUTH_ENFORCE=false, passa.
 */
export const requireRoleOrResident = (...allowed: StaffRole[]) =>
    async function (request: FastifyRequest, reply: FastifyReply) {
        const actor = request.actor;
        if (!actor) {
            if (process.env.AUTH_ENFORCE === 'false') return;
            return reply.fail({ type: 'unauthorized', detail: 'Não autorizado.', instance: request.url });
        }

        if (actor.role && (allowed as string[]).includes(actor.role)) return;

        // Consulta o Firebird (com cache): só quem não é equipe paga esse custo.
        const residence = await getResidence(actor.id);
        if (!residence.blocked) return;

        return reply.fail({ type: 'forbidden', detail: 'Acesso negado.', instance: request.url });
    };
