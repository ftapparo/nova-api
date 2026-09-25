import { NextFunction, Request, Response } from 'express';
import type { CorsOptions } from 'cors';

/**
 * Configuração de CORS baseada em lista branca de origens.
 *
 * A origem permitida vem de CORS_ALLOWED_ORIGINS (separada por vírgula).
 * Requisições sem cabeçalho Origin (server-to-server, curl, apps nativos)
 * são liberadas aqui — o controle delas é a autenticação, não o CORS.
 */
export const buildCorsOptions = (): CorsOptions => {
    const allowed = (process.env.CORS_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    if (allowed.length === 0) {
        console.warn('[Security] CORS_ALLOWED_ORIGINS não configurada. Nenhuma origem de navegador será aceita.');
    }

    return {
        origin: (origin, callback) => {
            if (!origin) {
                callback(null, true);
                return;
            }

            if (allowed.includes(origin)) {
                callback(null, true);
                return;
            }

            console.warn(`[Security] Origem bloqueada pelo CORS: ${origin}`);
            callback(null, false);
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'x-user',
            'x-request-id',
            'Idempotency-Key',
        ],
        exposedHeaders: ['x-request-id', 'x-actor'],
        credentials: false,
        maxAge: 86400,
    };
};

/**
 * Cabeçalhos de segurança HTTP.
 *
 * Equivalente ao subconjunto do helmet que se aplica a uma API JSON,
 * sem adicionar dependência nova. Substituir por helmet quando as
 * dependências forem atualizadas.
 */
export const securityHeaders = (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

    // HSTS só faz sentido sobre TLS. O túnel Cloudflare termina TLS na borda,
    // então o cabeçalho é enviado quando a requisição chegou por HTTPS.
    if (_req.secure || _req.header('x-forwarded-proto') === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
};

type RateLimitOptions = {
    windowMs: number;
    max: number;
    name: string;
};

type Bucket = {
    count: number;
    resetAt: number;
};

/**
 * Rate limit em memória, por IP.
 *
 * Implementação deliberadamente simples para a contenção inicial: não exige
 * Redis nem dependência nova. Limitações conhecidas — o contador é por
 * processo e se perde no restart. Substituir por rate-limiter-flexible sobre
 * Redis quando a infraestrutura compartilhada existir.
 */
export const rateLimit = ({ windowMs, max, name }: RateLimitOptions) => {
    const buckets = new Map<string, Bucket>();

    // Limpeza periódica para o mapa não crescer indefinidamente.
    const cleanup = setInterval(() => {
        const now = Date.now();
        for (const [key, bucket] of buckets) {
            if (bucket.resetAt <= now) buckets.delete(key);
        }
    }, 60_000);
    cleanup.unref();

    return (req: Request, res: Response, next: NextFunction): void => {
        const now = Date.now();
        const key = resolveClientIp(req);

        let bucket = buckets.get(key);
        if (!bucket || bucket.resetAt <= now) {
            bucket = { count: 0, resetAt: now + windowMs };
            buckets.set(key, bucket);
        }

        bucket.count += 1;

        const remaining = Math.max(0, max - bucket.count);
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

        if (bucket.count > max) {
            const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
            res.setHeader('Retry-After', String(retryAfter));
            console.warn(`[Security] Rate limit "${name}" excedido por ${key} em ${req.method} ${req.path}`);

            if (typeof res.fail === 'function') {
                res.fail('Limite de requisições excedido. Tente novamente em instantes.', 429, {
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter,
                });
            } else {
                res.status(429).json({
                    data: null,
                    message: 'Limite de requisições excedido.',
                    errors: { code: 'RATE_LIMIT_EXCEEDED', retryAfter },
                });
            }
            return;
        }

        next();
    };
};

/**
 * Resolve o IP real do cliente.
 *
 * Atrás do túnel Cloudflare, req.ip é o IP do cloudflared. O IP do visitante
 * chega em CF-Connecting-IP. Esse cabeçalho só é confiável porque o serviço
 * não é alcançável fora do túnel — se um dia passar a ser, ele volta a ser
 * forjável e este trecho precisa mudar.
 */
export const resolveClientIp = (req: Request): string => {
    const cfIp = req.header('cf-connecting-ip');
    if (cfIp && cfIp.trim()) return cfIp.trim();

    const forwarded = req.header('x-forwarded-for');
    if (forwarded && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }

    return req.ip || req.socket?.remoteAddress || 'desconhecido';
};

/**
 * Bloqueia acesso a uma rota quando a flag de habilitação não estiver ativa.
 * Usado para manter o Swagger fora do ar em produção.
 */
export const requireFlag = (envVar: string, mensagem: string) =>
    (_req: Request, res: Response, next: NextFunction): void => {
        if (process.env[envVar] === 'true') {
            next();
            return;
        }
        res.status(404).send(mensagem);
    };
