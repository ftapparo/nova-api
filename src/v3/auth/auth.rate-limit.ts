import type { FastifyRequest } from 'fastify';
import { AttemptLimiter } from '../shared/attempt-limiter';

// =============================================================================
// Limite de tentativas das rotas públicas de autenticação (login, signup).
// Não dá para delegar ao GoTrue: toda chamada chega nele vinda da nova-api,
// então o limite por IP dele enxergaria um único cliente.
// =============================================================================

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
