import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from '../swagger.json';
import healthRoutes from '../routes/health.routes';
import ProansiAccessRoutes from '../routes/freedomAccessRoutes';
import ProansiVehicleRoutes from '../routes/freedomVehicleRoutes';

export async function StartWebServer(): Promise<void> {
    const app = express();
    const port = process.env.PORT || 3000;

    /**
     * Middleware de CORS para permitir requisições de qualquer origem e métodos principais.
     */
    app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: '*',
        credentials: true
    }));

    /**
     * Middleware para parsear JSON nas requisições.
     */
    app.use(express.json());

    /**
     * Registro das rotas principais da API.
     * - /api/health: Healthcheck
     * - /api/gate: Controle de Portão
     */
    app.use('/v2/api', healthRoutes);
    app.use('/v2/api', ProansiAccessRoutes);
    app.use('/v2/api', ProansiVehicleRoutes);

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

