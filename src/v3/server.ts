import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import logger from '../core/utils/logger';
import { healthRoutes } from './routes/health.routes';
import { registerErrorHandler, responseHelpersPlugin } from './lib/reply-helpers';

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
    // tratamento central de erro — ver src/v3/lib/response.ts para o
    // desenho completo do envelope.
    await app.register(responseHelpersPlugin);
    registerErrorHandler(app);

    // Flag própria da v3 (independente da SWAGGER_ENABLED da v2): permite
    // manter o Swagger da v3 ligado durante o desenvolvimento ativo sem
    // afetar a v2, e desligar só a v3 quando ela for para produção de
    // verdade (mesmo raciocínio da v2: o spec cataloga endpoints sensíveis).
    const swaggerV3Enabled = process.env.SWAGGER_V3_ENABLED === 'true';
    if (swaggerV3Enabled) {
        await app.register(fastifySwagger, {
            openapi: {
                info: {
                    title: 'Nova API — v3',
                    version: '3.0.0',
                    description: 'API v3 (Fastify + Zod) do Condomínio Nova Residence — em construção, convive com a v2 (Express) no mesmo processo.',
                },
                servers: [],
            },
            transform: jsonSchemaTransform,
        });

        await app.register(fastifySwaggerUi, {
            routePrefix: '/v3/swagger',
        });
    }

    await app.register(async (instance) => {
        instance.withTypeProvider<ZodTypeProvider>();
        await healthRoutes(instance);
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
