import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { successResponseSchema } from '../shared/response';
import { extractBearerToken, requireAuth } from '../shared/require-auth';
import { issueTicket } from './ws-tickets';

// Ticket para abrir o /v3/ws (ver ws-tickets.ts). Qualquer conta autenticada
// pede; quem não tem nada a receber (sem papel e sem unidade liberada) é
// recusado no próprio upgrade.

// O token já foi validado pelo requireAuth; aqui só se lê o exp dele.
const readTokenExpiry = (token: string): number => {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : 0;
};

export async function wsRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post('/ws/ticket', {
        onRequest: requireAuth,
        schema: {
            response: { 200: successResponseSchema(z.object({ ticket: z.string(), expiresIn: z.number().int() })) },
        },
    }, async (request, reply) => {
        const token = extractBearerToken(request)!;
        return reply.ok(issueTicket(request.actor!, readTokenExpiry(token)));
    });
}
