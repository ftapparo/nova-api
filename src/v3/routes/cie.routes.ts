import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { successResponseSchema } from '../lib/response';
import { callService, sendServiceResult } from '../lib/service-proxy';
import {
    alarmActiveSnapshotSchema,
    blockCountersSchema,
    cieStateSnapshotSchema,
    logsListDataSchema,
    logTypeQuerySchema,
    outputCountersSchema,
    panelDataSchema,
} from '../lib/cie-schemas';

// Proxy para as rotas de leitura da v3 de nova-cie. Único serviço (uma
// central), sem necessidade de mapeamento por dispositivo como o TAG.
// Chamado pelo nome do serviço na rede Docker interna (nova-network),
// mesmo padrão que o CIE já usa para chamar de volta a nova-api
// (MAIN_API_BASE_URL=http://nova-api:3030).

// Lidas dentro das funções (não no topo do módulo): imports são
// resolvidos antes de dotenv.config() rodar em server.ts, então uma
// leitura no top-level do módulo capturaria sempre undefined.
const resolveCieV3BaseUrl = (): string =>
    (process.env.CIE_V3_BASE_URL || 'http://nova-cie:3031').trim().replace(/\/+$/, '');

const resolveCieServiceToken = (): string => process.env.CIE_SERVICE_TOKEN ?? '';

const resolveCieTimeout = (): number => {
    const value = Number(process.env.CIE_GATEWAY_TIMEOUT_MS || '5000');
    return Number.isFinite(value) && value > 0 ? value : 5000;
};

const resolveCieLogsTimeout = (): number => {
    const value = Number(process.env.CIE_GATEWAY_LOGS_TIMEOUT_MS || '15000');
    return Number.isFinite(value) && value > 0 ? value : 15000;
};

export async function cieRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get('/cie/status', {
        schema: { response: { 200: successResponseSchema(cieStateSnapshotSchema) } },
    }, async (_request, reply) => {
        const result = await callService<z.infer<typeof cieStateSnapshotSchema>>({
            baseUrl: resolveCieV3BaseUrl(),
            token: resolveCieServiceToken(),
            path: '/v3/api/cie/status',
            timeoutMs: resolveCieTimeout(),
        });
        sendServiceResult(reply, result);
    });

    typedApp.get('/cie/panel', {
        schema: { response: { 200: successResponseSchema(panelDataSchema) } },
    }, async (_request, reply) => {
        const result = await callService<z.infer<typeof panelDataSchema>>({
            baseUrl: resolveCieV3BaseUrl(),
            token: resolveCieServiceToken(),
            path: '/v3/api/cie/panel',
            timeoutMs: resolveCieTimeout(),
        });
        sendServiceResult(reply, result);
    });

    typedApp.get('/cie/alarms/active', {
        schema: { response: { 200: successResponseSchema(alarmActiveSnapshotSchema) } },
    }, async (_request, reply) => {
        const result = await callService<z.infer<typeof alarmActiveSnapshotSchema>>({
            baseUrl: resolveCieV3BaseUrl(),
            token: resolveCieServiceToken(),
            path: '/v3/api/cie/alarms/active',
            timeoutMs: resolveCieTimeout(),
        });
        sendServiceResult(reply, result);
    });

    typedApp.get('/cie/logs', {
        schema: {
            querystring: z.object({
                type: logTypeQuerySchema.optional(),
                limit: z.coerce.number().optional(),
                cursor: z.string().optional(),
            }),
            response: { 200: successResponseSchema(logsListDataSchema) },
        },
    }, async (request, reply) => {
        const result = await callService<z.infer<typeof logsListDataSchema>>({
            baseUrl: resolveCieV3BaseUrl(),
            token: resolveCieServiceToken(),
            path: '/v3/api/cie/logs',
            params: request.query,
            timeoutMs: resolveCieLogsTimeout(),
        });
        sendServiceResult(reply, result);
    });

    typedApp.get('/cie/counters/blocks', {
        schema: { response: { 200: successResponseSchema(blockCountersSchema) } },
    }, async (_request, reply) => {
        const result = await callService<z.infer<typeof blockCountersSchema>>({
            baseUrl: resolveCieV3BaseUrl(),
            token: resolveCieServiceToken(),
            path: '/v3/api/cie/counters/blocks',
            timeoutMs: resolveCieTimeout(),
        });
        sendServiceResult(reply, result);
    });

    typedApp.get('/cie/counters/outputs', {
        schema: { response: { 200: successResponseSchema(outputCountersSchema) } },
    }, async (_request, reply) => {
        const result = await callService<z.infer<typeof outputCountersSchema>>({
            baseUrl: resolveCieV3BaseUrl(),
            token: resolveCieServiceToken(),
            path: '/v3/api/cie/counters/outputs',
            timeoutMs: resolveCieTimeout(),
        });
        sendServiceResult(reply, result);
    });
}
