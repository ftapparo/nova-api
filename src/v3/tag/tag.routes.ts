import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { successResponseSchema } from '../shared/response';
import { callService, sendServiceResult } from '../shared/service-proxy';
import { requireRole } from '../shared/require-auth';
import { cacheTypeQuerySchema, gateStateSchema, listCacheDataSchema } from './tag.schema';

// Proxy para as rotas de leitura da v3 de nova-tag. TAG1/TAG2 rodam em
// containers separados, cada um com sua própria porta v3 — o mapeamento
// numeroDispositivo -> porta segue o mesmo padrão da v2 (TAG_CONTROL_HOST
// + TAG_V3_PORT_BASE + numeroDispositivo). TAG_SERVICE_TOKEN é o mesmo
// token configurado no nova-tag (.env), nunca reaproveitado de outro
// projeto.

// Lidas dentro das funções (não no topo do módulo): imports são
// resolvidos antes de dotenv.config() rodar em server.ts, então uma
// leitura no top-level do módulo capturaria sempre undefined.
const resolveTagControlHost = (): string => process.env.TAG_CONTROL_HOST?.trim() || '192.168.0.250';

const resolveTagV3PortBase = (): number => {
    const value = Number(process.env.TAG_V3_PORT_BASE || '4010');
    return Number.isFinite(value) && value > 0 ? value : 4010;
};

const resolveTagServiceToken = (): string => process.env.TAG_SERVICE_TOKEN ?? '';

const resolveControlTimeout = (): number => {
    const value = Number(process.env.CONTROL_TIMEOUT_MS || '5000');
    return Number.isFinite(value) && value > 0 ? value : 5000;
};

const resolveTagV3BaseUrl = (numeroDispositivo: number): string =>
    `http://${resolveTagControlHost()}:${resolveTagV3PortBase() + numeroDispositivo}`;

// Portões: só equipe (decisão de 28/09/2026). Por rota, não addHook: tag e
// cie dividem o mesmo escopo no server.ts, um hook de escopo vazaria.
const tagAccess = requireRole('porteiro', 'sindico', 'admin');

export async function tagRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get('/tag/gate/state', {
        onRequest: tagAccess,
        schema: {
            querystring: z.object({ numeroDispositivo: z.coerce.number().int().positive() }),
            response: { 200: successResponseSchema(gateStateSchema) },
        },
    }, async (request, reply) => {
        const result = await callService<z.infer<typeof gateStateSchema>>({
            baseUrl: resolveTagV3BaseUrl(request.query.numeroDispositivo),
            token: resolveTagServiceToken(),
            path: '/v3/api/gate/state',
            timeoutMs: resolveControlTimeout(),
        });
        sendServiceResult(reply, result);
    });

    typedApp.get('/tag/cache', {
        onRequest: tagAccess,
        schema: {
            querystring: z.object({
                numeroDispositivo: z.coerce.number().int().positive(),
                type: cacheTypeQuerySchema.optional(),
            }),
            response: { 200: successResponseSchema(listCacheDataSchema) },
        },
    }, async (request, reply) => {
        const { numeroDispositivo, type } = request.query;
        const result = await callService<z.infer<typeof listCacheDataSchema>>({
            baseUrl: resolveTagV3BaseUrl(numeroDispositivo),
            token: resolveTagServiceToken(),
            path: '/v3/api/cache',
            params: type ? { type } : undefined,
            timeoutMs: resolveControlTimeout(),
        });
        sendServiceResult(reply, result);
    });
}
