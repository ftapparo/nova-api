import WebSocket from 'ws';
import logger from '../../core/utils/logger';

// =============================================================================
// Cliente dos WebSockets internos (/v3/ws do nova-cie e de cada nova-tag),
// autenticado por token de serviço. Reconecta sozinho com espera crescente
// (1 s → 30 s): TAG e CIE reiniciam em deploy e a nova-api não pode depender
// da ordem de subida das stacks.
// =============================================================================

export type UpstreamMessage = { event: string; data: unknown };

export type UpstreamOptions = {
    name: string;
    url: string;
    token: string;
    onMessage: (message: UpstreamMessage) => void;
    onConnectionChange: (connected: boolean) => void;
};

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
// TAG e CIE mandam ping a cada 30 s; sem ping por mais que isso a conexão
// morreu sem FIN (rede, container parado) e é derrubada para reconectar.
const SILENCE_LIMIT_MS = 75_000;

export class UpstreamSocket {
    private ws: WebSocket | null = null;
    private retryMs = MIN_RETRY_MS;
    private retryTimer: NodeJS.Timeout | null = null;
    private silenceTimer: NodeJS.Timeout | null = null;
    private connected = false;
    private stopped = false;

    constructor(private readonly options: UpstreamOptions) {}

    start() {
        this.stopped = false;
        this.connect();
    }

    stop() {
        this.stopped = true;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.ws?.terminate();
    }

    private setConnected(connected: boolean) {
        if (this.connected === connected) return;
        this.connected = connected;
        this.options.onConnectionChange(connected);
    }

    private watchSilence(ws: WebSocket) {
        if (this.silenceTimer) clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => ws.terminate(), SILENCE_LIMIT_MS);
    }

    private connect() {
        const { name, url, token } = this.options;
        const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` }, handshakeTimeout: 10_000 });
        this.ws = ws;

        ws.on('open', () => {
            this.retryMs = MIN_RETRY_MS;
            this.watchSilence(ws);
            logger.info(`[ApiV3 WS] Conectado ao upstream ${name}`);
            this.setConnected(true);
        });

        ws.on('ping', () => this.watchSilence(ws));

        ws.on('message', (raw) => {
            let parsed: { event?: unknown; data?: unknown };
            try {
                parsed = JSON.parse(raw.toString());
            } catch {
                logger.warn(`[ApiV3 WS] Mensagem inválida do upstream ${name}`);
                return;
            }
            if (typeof parsed.event !== 'string' || parsed.event === 'connection.established') return;
            try {
                this.options.onMessage({ event: parsed.event, data: parsed.data });
            } catch (error) {
                logger.error(`[ApiV3 WS] Falha ao repassar evento ${parsed.event} de ${name}:`, error);
            }
        });

        // 'error' sempre vem seguido de 'close'; a reconexão fica só no close.
        ws.on('error', (error) => logger.warn(`[ApiV3 WS] Upstream ${name}: ${error.message}`));
        ws.on('unexpected-response', (_request, response) => {
            logger.error(`[ApiV3 WS] Upstream ${name} recusou a conexão (HTTP ${response.statusCode})`);
            ws.terminate();
        });

        ws.on('close', () => {
            if (this.silenceTimer) clearTimeout(this.silenceTimer);
            this.setConnected(false);
            if (this.stopped) return;
            this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
            this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
        });
    }
}
