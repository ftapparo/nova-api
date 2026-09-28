import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

// Rota de teste: valida que a v3 sobe, responde, e consegue tipar
// entrada/saída com Zod. Não depende de core/ ainda de propósito —
// isso é só o esqueleto mínimo antes de migrar qualquer rota real.
export async function healthRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    const schema = {
        response: {
            200: z.object({
                status: z.literal('API Funcionando!'),
                environment: z.string(),
                version: z.literal('v3'),
            }),
        },
    };

    const handler = async () => ({
        status: 'API Funcionando!' as const,
        environment: process.env.NODE_ENV || 'development',
        version: 'v3' as const,
    });

    // Mesmo par de rotas da v2 (/health e /healthcheck apontando pro mesmo
    // handler), mantido por compatibilidade de convenção entre as versões.
    typedApp.get('/health', { schema }, handler);
    typedApp.get('/healthcheck', { schema }, handler);
}
