import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { successResponseSchema } from '../shared/response';
import { callService, sendServiceResult } from '../shared/service-proxy';
import { requireRoleOrResident } from '../residence/residence.guard';
import {
    alarmActiveSnapshotSchema,
    blockCountersSchema,
    cieStateSnapshotSchema,
    logsListDataSchema,
    logTypeQuerySchema,
    outputCountersSchema,
    panelDataSchema,
} from './cie.schema';

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

// Central de incêndio: equipe e morador com unidade liberada. Hoje todas as
// rotas são de leitura; rota de comando futura deve usar requireRole
// (só equipe) — morador só lê (decisão de 28/09/2026).
const cieReadAccess = requireRoleOrResident('porteiro', 'sindico', 'admin');

export async function cieRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get('/cie/status', {
        onRequest: cieReadAccess,
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
        onRequest: cieReadAccess,
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
        onRequest: cieReadAccess,
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
        onRequest: cieReadAccess,
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
        onRequest: cieReadAccess,
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
        onRequest: cieReadAccess,
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
