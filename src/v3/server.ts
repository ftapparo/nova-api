import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import logger from '../core/utils/logger';
import { healthRoutes } from './routes/health.routes';

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
