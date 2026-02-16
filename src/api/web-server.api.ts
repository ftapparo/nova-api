import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from '../swagger.json';
import healthRoutes from '../routes/health.routes';
import accessRoutes from '../routes/access.routes';
import vehicleRoutes from '../routes/vehicle.routes';
import vehicleV2Routes from '../routes/vehicle-v2.routes';
import exhaustRoutes from '../routes/exhaust.routes';
import queryRoutes from '../routes/query.routes';
import controlRoutes from '../routes/control.routes';
import userSettingsRoutes from '../routes/user-settings.routes';
import { responseHandler } from '../middleware/response-handler';
import { commandAuditMiddleware } from '../middleware/command-audit';
import commandLogRoutes from '../routes/command-log.routes';
import { requestContextMiddleware } from '../middleware/request-context';

const swaggerUiOptions = {
    swaggerOptions: {
        requestInterceptor: (request: any) => {
            request.headers = request.headers || {};
            request.headers['x-user'] = 'SWAGGER';
            request.headers['x-request-id'] = `swagger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            return request;
        }
    }
};

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
    app.options(/.*/, cors());

    /**
     * Middleware para parsear JSON nas requisições.
     */
    app.use(express.json());
    app.use(requestContextMiddleware);
    app.use(commandAuditMiddleware);

    /**
     * Middleware para padronizar respostas da API.
     */
    app.use(responseHandler);

    /**
     * Registro das rotas principais da API.
     * - /v2/api/health: Healthcheck
     * - /v2/api/access: Controle de acesso (verificação de identidade, logs de acesso)
     * - /v2/api/vehicle: Controle de veículos (entrada/saída)
     * - /v2/api/exhausts: Controle de exaustores
     * - /v2/api/query: Consultas diversas
     * - /v2/api/control: Controles diversos (portas, portões)
     */
    app.use('/v2/api', healthRoutes);
    app.use('/v2/api', accessRoutes);
    app.use('/v2/api', vehicleRoutes);
    app.use('/v2/api', vehicleV2Routes);
    app.use('/v2/api', exhaustRoutes);
    app.use('/v2/api', queryRoutes);
    app.use('/v2/api', controlRoutes);
    app.use('/v2/api', userSettingsRoutes);
    app.use('/v2/api', commandLogRoutes);

    /**
     * Rota para servir a documentação Swagger UI.
     */
    app.use('/v2/swagger', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerUiOptions));

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

