import type { FastifyRequest } from 'fastify';

// =============================================================================
// Limite de tentativas das rotas públicas de autenticação (login, signup).
// Não dá para delegar ao GoTrue: toda chamada chega nele vinda da nova-api,
// então o limite por IP dele enxergaria um único cliente.
//
// Em memória, por processo: basta com uma réplica só da API. Com várias
// réplicas, migrar para Redis (CHECKLIST §2.6).
// =============================================================================

type Window = { count: number; resetAt: number };

export class AttemptLimiter {
    private readonly windows = new Map<string, Window>();

    constructor(private readonly max: number, private readonly windowMs: number) {
        // Limpeza periódica para o Map não crescer indefinidamente com
        // chaves de IPs/e-mails que nunca mais voltam. unref(): não segura
        // o processo vivo só por causa deste timer.
        setInterval(() => this.sweep(), windowMs).unref();
    }

    /** Segundos até liberar, ou 0 se a chave ainda está dentro do limite. */
    retryAfter(key: string): number {
        const window = this.windows.get(key);
        if (!window || window.resetAt <= Date.now()) return 0;
        return window.count >= this.max ? Math.ceil((window.resetAt - Date.now()) / 1000) : 0;
    }

    hit(key: string): void {
        const now = Date.now();
        const window = this.windows.get(key);
        if (!window || window.resetAt <= now) {
            this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
            return;
        }
        window.count += 1;
    }

    reset(key: string): void {
        this.windows.delete(key);
    }

    private sweep(): void {
        const now = Date.now();
        for (const [key, window] of this.windows) {
            if (window.resetAt <= now) this.windows.delete(key);
        }
    }
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Toda tentativa de login conta por IP — segura varredura de muitas contas
// a partir de uma origem.
export const loginByIp = new AttemptLimiter(20, FIFTEEN_MINUTES);
// Só falhas contam por e-mail, e login certo zera — segura ataque
// distribuído (vários IPs) contra uma conta, sem punir o dono que acerta.
export const loginFailuresByEmail = new AttemptLimiter(5, FIFTEEN_MINUTES);
// Cadastro aberto: limita criação em massa de contas a partir de uma origem.
export const signupByIp = new AttemptLimiter(5, ONE_HOUR);

/**
 * IP real do visitante. Atrás do Cloudflare Tunnel o IP da conexão é
 * sempre o do cloudflared; o do visitante chega em CF-Connecting-IP. Só é
 * confiável porque a porta da v3 não é alcançável sem passar pelo túnel —
 * mesma regra de resolveClientIp da v2 (não importada: v3 não depende de v2).
 */
export const resolveClientIp = (request: FastifyRequest): string => {
    const cfIp = request.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();
    return request.ip;
};

export const normalizeEmailKey = (email: string): string => email.trim().toLowerCase();
