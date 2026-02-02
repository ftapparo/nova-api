// src/swagger.ts
import path from 'path';
import swaggerJSDoc from 'swagger-jsdoc';

const fileExtension = process.env.NODE_ENV === 'production' ? 'js' : 'ts';

export const swaggerSpec = swaggerJSDoc({
    definition: {
        openapi: '3.0.1',
        info: {
            title: 'Freedom API',
            description: 'Serviço de integração com o sistema Freedom Proansi.',
            version: '1.0.0',
        },
        tags: [
            {
                name: 'Monitoramento',
                description: 'Verificação de status e saúde da API (health check).',
            },
            {
                name: 'Acessos',
                description: 'Operações relacionadas à verificação, liberação e registro de acessos (pedestres e veículos).',
            },
            {
                name: 'Veículos',
                description: 'Gerenciamento de dados de veículos, incluindo cadastro, bloqueio, imagem e TAG de acesso.',
            },
        ],
    },
    apis: [
        path.resolve(__dirname, `./routes/*.${fileExtension}`),
        path.resolve(__dirname, `./controllers/*.${fileExtension}`),
    ],
});

export default swaggerSpec;
