import { randomBytes } from 'node:crypto';
import type { Actor } from '../shared/require-auth';

// =============================================================================
// Ticket de uso único para abrir o WebSocket. O navegador não consegue
// mandar Authorization no handshake, e access token na URL acabaria em log
// de proxy; o ticket vale 30 s, uma vez só, e não serve para mais nada.
// Em memória: um processo só (quando houver réplicas, vai para o Redis
// junto com o rate limit — CHECKLIST §2.6).
// =============================================================================

const TICKET_TTL_MS = 30_000;

export type WsTicket = {
    actor: Actor;
    /** Expiração do access token que pediu o ticket (epoch s): o socket fecha nela. */
    tokenExpiresAt: number;
    expiresAt: number;
};

const tickets = new Map<string, WsTicket>();

const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, ticket] of tickets) {
        if (ticket.expiresAt <= now) tickets.delete(key);
    }
}, 60_000);
sweep.unref();

export const issueTicket = (actor: Actor, tokenExpiresAt: number): { ticket: string; expiresIn: number } => {
    const ticket = randomBytes(24).toString('base64url');
    tickets.set(ticket, { actor, tokenExpiresAt, expiresAt: Date.now() + TICKET_TTL_MS });
    return { ticket, expiresIn: TICKET_TTL_MS / 1000 };
};

/** Consome o ticket: devolve os dados só na primeira vez e dentro do prazo. */
export const consumeTicket = (ticket: string): WsTicket | null => {
    const entry = tickets.get(ticket);
    if (!entry) return null;
    tickets.delete(ticket);
    return entry.expiresAt > Date.now() ? entry : null;
};
