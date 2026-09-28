import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { successResponseSchema } from '../shared/response';

// Rota de referência: mostra o padrão de resposta da v3 (reply.ok(),
// schema de sucesso via successResponseSchema) que toda rota nova deve
// seguir. Não depende de core/ ainda de propósito — isso é só o
// esqueleto mínimo antes de migrar qualquer rota real de negócio.
const healthDataSchema = z.object({
    status: z.literal('API Funcionando!'),
    environment: z.string(),
});

export async function healthRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    const schema = {
        response: {
            200: successResponseSchema(healthDataSchema),
        },
    };

    // Mesmo par de rotas da v2 (/health e /healthcheck apontando pro mesmo
    // handler), mantido por compatibilidade de convenção entre as versões.
    typedApp.get('/health', { schema }, async (_request, reply) => {
        reply.ok({
            status: 'API Funcionando!' as const,
            environment: process.env.NODE_ENV || 'development',
        });
    });

    typedApp.get('/healthcheck', { schema }, async (_request, reply) => {
        reply.ok({
            status: 'API Funcionando!' as const,
            environment: process.env.NODE_ENV || 'development',
        });
    });
}
