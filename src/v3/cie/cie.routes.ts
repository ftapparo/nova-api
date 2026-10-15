import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { successResponseSchema } from '../shared/response';
import { callService, sendServiceResult, type ServiceCallResult } from '../shared/service-proxy';
import { resolveLang } from '../shared/i18n';
import { localizeCie } from './cie.i18n';
import { requireRoleOrResident } from '../residence/residence.guard';
import {
    activeEventsDataSchema,
    activeTypeQuerySchema,
    alarmActiveSnapshotSchema,
    blockCountersSchema,
    cieStateSnapshotSchema,
    eventKindQuerySchema,
    installationDataSchema,
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

// Rótulos interpretados pelo nova-cie (em português) no idioma do app.
const localized = <T>(request: FastifyRequest, result: ServiceCallResult<T>): ServiceCallResult<T> =>
    result.ok ? { ok: true, data: localizeCie(result.data, resolveLang(request.headers['accept-language'])) } : result;

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

// Central de incêndio: equipe e morador com unidade liberada leem. Comandos
// ficam em cie.commands.routes.ts, só equipe — morador só lê (decisão de
// 28/09/2026).
const cieReadAccess = requireRoleOrResident('porteiro', 'sindico', 'admin');

export async function cieRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get('/cie/status', {
        onRequest: cieReadAccess,
        schema: { response: { 200: successResponseSchema(cieStateSnapshotSchema) } },
    }, async (request, reply) => {
        const result = await callService<z.infer<typeof cieStateSnapshotSchema>>({
            baseUrl: resolveCieV3BaseUrl(),
            token: resolveCieServiceToken(),
            path: '/v3/api/cie/status',
            timeoutMs: resolveCieTimeout(),
        });
        sendServiceResult(reply, localized(request, result));
    });

    typedApp.get('/cie/panel', {
        onRequest: cieReadAccess,
        schema: { response: { 200: successResponseSchema(panelDataSchema) } },
    }, async (request, reply) => {
        const result = await callService<z.infer<typeof panelDataSchema>>({
            baseUrl: resolveCieV3BaseUrl(),
            token: resolveCieServiceToken(),
            path: '/v3/api/cie/panel',
            timeoutMs: resolveCieTimeout(),
        });
        sendServiceResult(reply, localized(request, result));
    });

    typedApp.get('/cie/alarms/active', {
        onRequest: cieReadAccess,
        schema: { response: { 200: successResponseSchema(alarmActiveSnapshotSchema) } },
    }, async (request, reply) => {
        const result = await callService<z.infer<typeof alarmActiveSnapshotSchema>>({
            baseUrl: resolveCieV3BaseUrl(),
            token: resolveCieServiceToken(),
            path: '/v3/api/cie/alarms/active',
            timeoutMs: resolveCieTimeout(),
        });
        sendServiceResult(reply, localized(request, result));
    });

    typedApp.get('/cie/events/active', {
        onRequest: cieReadAccess,
        schema: {
            querystring: z.object({ type: activeTypeQuerySchema.optional() }),
            response: { 200: successResponseSchema(activeEventsDataSchema) },
        },
    }, async (request, reply) => {
        const result = await callService<z.infer<typeof activeEventsDataSchema>>({
            baseUrl: resolveCieV3BaseUrl(),
            token: resolveCieServiceToken(),
            path: '/v3/api/cie/events/active',
            params: request.query,
            timeoutMs: resolveCieTimeout(),
        });
        sendServiceResult(reply, localized(request, result));
    });

    typedApp.get('/cie/logs', {
        onRequest: cieReadAccess,
        schema: {
            querystring: z.object({
                type: logTypeQuerySchema.optional(),
                kind: eventKindQuerySchema.optional(),
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
        sendServiceResult(reply, localized(request, result));
    });

    typedApp.get('/cie/installation', {
        onRequest: cieReadAccess,
        schema: { response: { 200: successResponseSchema(installationDataSchema) } },
    }, async (request, reply) => {
        const result = await callService<z.infer<typeof installationDataSchema>>({
            baseUrl: resolveCieV3BaseUrl(),
            token: resolveCieServiceToken(),
            path: '/v3/api/cie/installation',
            timeoutMs: resolveCieTimeout(),
        });
        sendServiceResult(reply, localized(request, result));
    });

    typedApp.get('/cie/counters/blocks', {
        onRequest: cieReadAccess,
        schema: { response: { 200: successResponseSchema(blockCountersSchema) } },
    }, async (request, reply) => {
        const result = await callService<z.infer<typeof blockCountersSchema>>({
            baseUrl: resolveCieV3BaseUrl(),
            token: resolveCieServiceToken(),
            path: '/v3/api/cie/counters/blocks',
            timeoutMs: resolveCieTimeout(),
        });
        sendServiceResult(reply, localized(request, result));
    });

    typedApp.get('/cie/counters/outputs', {
        onRequest: cieReadAccess,
        schema: { response: { 200: successResponseSchema(outputCountersSchema) } },
    }, async (request, reply) => {
        const result = await callService<z.infer<typeof outputCountersSchema>>({
            baseUrl: resolveCieV3BaseUrl(),
            token: resolveCieServiceToken(),
            path: '/v3/api/cie/counters/outputs',
            timeoutMs: resolveCieTimeout(),
        });
        sendServiceResult(reply, localized(request, result));
    });
}
