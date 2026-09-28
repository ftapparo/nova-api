import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

// Rota de teste: valida que a v3 sobe, responde, e consegue tipar
// entrada/saída com Zod. Não depende de core/ ainda de propósito —
// isso é só o esqueleto mínimo antes de migrar qualquer rota real.
export async function healthRoutes(app: FastifyInstance) {
    app.withTypeProvider<ZodTypeProvider>().get(
        '/healthcheck',
        {
            schema: {
                response: {
                    200: z.object({
                        status: z.literal('API Funcionando!'),
                        environment: z.string(),
                        version: z.literal('v3'),
                    }),
                },
            },
        },
        async () => ({
            status: 'API Funcionando!' as const,
            environment: process.env.NODE_ENV || 'development',
            version: 'v3' as const,
        }),
    );
}
