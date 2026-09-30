import axios, { AxiosError } from 'axios';
import type { FastifyReply } from 'fastify';

// =============================================================================
// Proxy genérico para chamar as rotas v3 de nova-tag e nova-cie, que ficam
// só na rede interna (nunca expostas à internet). A nova-api autentica
// essas chamadas com um token de serviço próprio de cada backend — ver
// docs/PADRAO-RESPOSTA-V3.md, seção "Autenticação de serviço para
// backends internos".
//
// A resposta upstream já vem no mesmo formato { success, data, meta } —
// este proxy extrai só o `data` e deixa a rota que chamou remontar com
// reply.ok()/reply.fail(), mantendo um único ponto de montagem do
// envelope por processo.
// =============================================================================

export type ServiceCallOptions = {
    baseUrl: string;
    token: string;
    path: string;
    method?: 'GET' | 'POST' | 'DELETE';
    params?: Record<string, unknown>;
    body?: unknown;
    timeoutMs?: number;
    /** Cabeçalhos extras (ex.: identidade do ator, para log no serviço interno). */
    headers?: Record<string, string>;
};

export type ServiceCallResult<T> =
    | { ok: true; data: T }
    | { ok: false; status: number; detail: string };

export async function callService<T>(options: ServiceCallOptions): Promise<ServiceCallResult<T>> {
    const url = `${options.baseUrl.replace(/\/+$/, '')}${options.path}`;

    try {
        const response = await axios.request({
            method: options.method ?? 'GET',
            url,
            params: options.params,
            data: options.body,
            timeout: options.timeoutMs ?? 5000,
            headers: {
                ...options.headers,
                Authorization: `Bearer ${options.token}`,
            },
        });

        const payload = response.data as { data?: T } | T;
        const data = (payload as { data?: T })?.data ?? (payload as T);
        return { ok: true, data };
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<{ error?: { detail?: string } }>;
            const status = axiosError.response?.status ?? 502;
            const detail = axiosError.response?.data?.error?.detail ?? axiosError.message;
            return { ok: false, status, detail };
        }
        return { ok: false, status: 500, detail: 'Erro inesperado ao chamar serviço interno.' };
    }
}

/**
 * Envia o resultado de callService() já no envelope padrão da v3 desta
 * API. Uso: `return sendServiceResult(reply, await callService(...));`
 */
export function sendServiceResult<T>(reply: FastifyReply, result: ServiceCallResult<T>): FastifyReply {
    if (result.ok) {
        return reply.ok(result.data);
    }

    return reply.fail({
        type: 'upstream-error',
        detail: result.detail,
        status: result.status,
    });
}
