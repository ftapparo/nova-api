import type http from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import logger from '../../core/utils/logger';
import { API_VERSION } from '../shared/response';
import type { Actor } from '../shared/require-auth';
import { consumeTicket } from './ws-tickets';

// =============================================================================
// WebSocket da nova-api para apps e painel (/v3/ws). Mesmo envelope e
// mesmo desenho dos brokers do TAG e do CIE (heartbeat, limite, upgrade
// recusado com status HTTP), com duas diferenças: autenticação por ticket
// de usuário (ws-tickets.ts) e entrega filtrada — cada evento chega só a
// quem pode vê-lo (ver ws.gateway.ts).
//
// O socket só envia; mensagens do cliente são ignoradas.
// =============================================================================

export type WsAudience = {
    actor: Actor;
    staff: boolean;
    /** Morador com ao menos uma unidade liberada (lê a central de incêndio). */
    resident: boolean;
    /** Exaustores que o morador opera (prumadas das unidades liberadas). */
    exhaustIds: ReadonlySet<string>;
};

export type BrokerOptions = {
    path: string;
    maxClients: number;
    maxClientsPerAccount: number;
    heartbeatMs: number;
    /** Monta o público do cliente a partir do ator do ticket. */
    resolveAudience: (actor: Actor) => Promise<WsAudience>;
};

// Cliente lento demais (rede ruim) acumulando mensagens: melhor derrubar e
// deixar reconectar do que segurar memória por ele.
const MAX_BUFFERED_BYTES = 1024 * 1024;

const rejectUpgrade = (socket: Duplex, status: number, reason: string) => {
    socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
};

const envelope = (event: string, data: unknown) => JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data,
    meta: { version: API_VERSION },
});

type Client = { ws: WebSocket; audience: WsAudience; alive: boolean; expiryTimer: NodeJS.Timeout };

export class ApiWsBroker {
    private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
    private readonly clients = new Set<Client>();
    private readonly heartbeatTimer: NodeJS.Timeout;

    constructor(server: http.Server, private readonly options: BrokerOptions) {
        server.on('upgrade', (request, socket, head) => {
            void this.handleUpgrade(request, socket, head).catch((error) => {
                logger.error('[ApiV3 WS] Falha no upgrade:', error);
                rejectUpgrade(socket, 500, 'Internal Server Error');
            });
        });

        // Conexão que caiu sem FIN ficaria ocupando vaga para sempre.
        this.heartbeatTimer = setInterval(() => {
            for (const client of this.clients) {
                if (!client.alive) {
                    client.ws.terminate();
                    continue;
                }
                client.alive = false;
                client.ws.ping();
            }
        }, options.heartbeatMs);
    }

    private async handleUpgrade(request: http.IncomingMessage, socket: Duplex, head: Buffer) {
        const url = new URL(request.url || '/', 'http://localhost');
        if (url.pathname !== this.options.path) {
            socket.destroy();
            return;
        }

        const ticket = consumeTicket(url.searchParams.get('ticket') ?? '');
        if (!ticket) return rejectUpgrade(socket, 401, 'Unauthorized');

        const { actor } = ticket;
        const msUntilExpiry = ticket.tokenExpiresAt * 1000 - Date.now();
        if (msUntilExpiry <= 0) return rejectUpgrade(socket, 401, 'Unauthorized');

        if (this.clients.size >= this.options.maxClients) return rejectUpgrade(socket, 503, 'Service Unavailable');
        const sameAccount = [...this.clients].filter((client) => client.audience.actor.id === actor.id).length;
        if (sameAccount >= this.options.maxClientsPerAccount) return rejectUpgrade(socket, 429, 'Too Many Requests');

        const audience = await this.options.resolveAudience(actor);
        if (!audience.staff && !audience.resident) return rejectUpgrade(socket, 403, 'Forbidden');

        this.wss.handleUpgrade(request, socket, head, (ws) => {
            // O socket não sobrevive ao access token: fecha na expiração e o
            // cliente pede ticket novo com o token renovado.
            const expiryTimer = setTimeout(() => ws.close(4001, 'Token expirado'), msUntilExpiry);
            const client: Client = { ws, audience, alive: true, expiryTimer };
            this.clients.add(client);

            ws.on('pong', () => { client.alive = true; });
            ws.on('close', () => {
                clearTimeout(expiryTimer);
                this.clients.delete(client);
            });
            ws.on('error', (error) => logger.warn(`[ApiV3 WS] Erro no cliente ${actor.id}: ${error.message}`));
            ws.send(envelope('connection.established', { ok: true }));
        });
    }

    /** Envia o evento só aos clientes aceitos por `canReceive`. */
    publish(event: string, data: unknown, canReceive: (audience: WsAudience) => boolean) {
        let text: string | null = null;
        for (const client of this.clients) {
            if (client.ws.readyState !== WebSocket.OPEN || !canReceive(client.audience)) continue;
            if (client.ws.bufferedAmount > MAX_BUFFERED_BYTES) {
                client.ws.terminate();
                continue;
            }
            text ??= envelope(event, data);
            client.ws.send(text);
        }
    }

    close() {
        clearInterval(this.heartbeatTimer);
        for (const client of this.clients) client.ws.terminate();
        this.wss.close();
    }
}
