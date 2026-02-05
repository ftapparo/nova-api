import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from '../swagger.json';
import healthRoutes from '../routes/health.routes';
import accessRoutes from '../routes/access.routes';
import vehicleRoutes from '../routes/vehicle.routes';
import exaustorRoutes from '../routes/exaustor.routes';
import { responseHandler } from '../middleware/response-handler';

export async function StartWebServer(): Promise<void> {
    const app = express();
    const port = process.env.PORT || 3000;

    /**
     * Middleware de CORS para permitir requisições de qualquer origem e métodos principais.
     */
    app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: '*',
        credentials: false
    }));

    /**
     * Middleware para tratar requisições OPTIONS (CORS Preflight).
     */
    app.options('/*', cors());

    /**
     * Middleware para parsear JSON nas requisições.
     */
    app.use(express.json());

    /**
     * Middleware para padronizar respostas da API.
     */
    app.use(responseHandler);

    /**
     * Registro das rotas principais da API.
     * - /v2/api/health: Healthcheck
     * - /v2/api/access: Rotas de controle de acesso
     * - /v2/api/vehicles: Rotas de controle de veículos
     */
    app.use('/v2/api', healthRoutes);
    app.use('/v2/api', accessRoutes);
    app.use('/v2/api', vehicleRoutes);
    app.use('/v2/api', exaustorRoutes);

    /**
     * Rota para servir a documentação Swagger UI.
     */
    app.use('/v2/swagger', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

    /**
     * Endpoint para servir o arquivo swagger.json (OpenAPI spec).
     */
    app.get('/v2/apispec_1.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerDocument);
    });

    /**
     * Middleware para tratar rotas não encontradas (404).
     */
    app.use((_req, res) => {
        res.status(404).send();
    });

    /**
     * Inicializa o servidor Express na porta configurada.
     */
    app.listen(port, () => {
        console.log(`[Api] WebServer rodando na porta ${port}`);
    });
}

