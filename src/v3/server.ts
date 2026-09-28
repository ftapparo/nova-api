import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import logger from '../core/utils/logger';
import { healthRoutes } from './health/health.routes';
import { tagRoutes } from './tag/tag.routes';
import { cieRoutes } from './cie/cie.routes';
import { registerErrorHandler, responseHelpersPlugin } from './shared/reply-helpers';
import openapiDocument from './openapi.json';

/**
 * Bootstrap da v3 (Fastify + Zod). Roda num processo/porta própria,
 * lado a lado com a v2 (Express) — ambas chamam o mesmo core/, nunca
 * duplicam lógica de negócio nem abrem uma segunda conexão com
 * recursos físicos/externos (Firebird, Postgres, etc. já são
 * gerenciados como pool/singleton em core/, então convivem bem com
 * dois servidores HTTP no mesmo processo Node).
 *
 * Path público: /v3/api/*, em porta interna própria (PORT_V3),
 * roteada externamente por uma entrada dedicada no Cloudflare Tunnel
 * (nao a mesma porta da v2/Express).
 */
export async function StartWebServerV3(): Promise<void> {
    const app = Fastify({
        logger: false, // usamos o logger próprio (winston) em vez do pino embutido
    });

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // Mecanismo de resposta padrão da v3 (reply.ok()/reply.fail()) e
    // tratamento central de erro — ver src/v3/shared/response.ts para o
    // desenho completo do envelope.
    await app.register(responseHelpersPlugin);
    registerErrorHandler(app);

    // Flag própria da v3 (independente da SWAGGER_ENABLED da v2): permite
    // manter o Swagger da v3 ligado durante o desenvolvimento ativo sem
    // afetar a v2, e desligar só a v3 quando ela for para produção de
    // verdade (mesmo raciocínio da v2: o spec cataloga endpoints sensíveis).
    //
    // Spec escrito à mão em openapi.json (não gerado a partir dos schemas
    // Zod): a geração automática do @fastify/swagger ficou pobre demais
    // (sem summary/description reais, "pagination" aparecendo mesmo em
    // endpoints sem paginação, valores de exemplo sem sentido) — mesmo
    // padrão que a v2 já usa com swagger.json mantido manualmente.
    const swaggerV3Enabled = process.env.SWAGGER_V3_ENABLED === 'true';
    if (swaggerV3Enabled) {
        // mode: 'static' — @fastify/swagger só serve o documento pronto,
        // sem tentar gerar nada a partir dos schemas Zod das rotas.
        await app.register(fastifySwagger, {
            mode: 'static',
            specification: { document: openapiDocument as never },
        });

        await app.register(fastifySwaggerUi, {
            routePrefix: '/v3/swagger',
        });

        app.get('/v3/apispec_1.json', async (_request, reply) => {
            reply.header('Content-Type', 'application/json').send(openapiDocument);
        });
    }

    await app.register(async (instance) => {
        instance.withTypeProvider<ZodTypeProvider>();
        await healthRoutes(instance);
        await tagRoutes(instance);
        await cieRoutes(instance);
    }, { prefix: '/v3/api' });

    const port = Number(process.env.PORT_V3 || 3031);

    try {
        await app.listen({ port, host: '0.0.0.0' });
        logger.info(`[ApiV3] WebServer (Fastify) rodando na porta ${port}`);
    } catch (err) {
        logger.error('[ApiV3] Falha ao iniciar o servidor Fastify:', err);
        throw err;
    }
}
