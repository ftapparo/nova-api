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
import cieGatewayRoutes from '../routes/cie-gateway.routes';
import { responseHandler } from '../middleware/response-handler';
import { commandAuditMiddleware } from '../middleware/command-audit';
import commandLogRoutes from '../routes/command-log.routes';
import { requestContextMiddleware } from '../middleware/request-context';
import pushRoutes from '../routes/push.routes';
import { buildCorsOptions, rateLimit, requireFlag, securityHeaders } from '../middleware/security';

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
     * O serviço roda atrás do túnel Cloudflare, que atua como proxy.
     * Sem isto, req.ip seria sempre o IP do cloudflared.
     */
    app.set('trust proxy', true);
    app.disable('x-powered-by');

    /**
     * Cabeçalhos de segurança aplicados a todas as respostas.
     */
    app.use(securityHeaders);

    /**
     * Middleware de CORS restrito às origens configuradas em CORS_ALLOWED_ORIGINS.
     */
    const corsOptions = buildCorsOptions();
    app.use(cors(corsOptions));

    /**
     * Middleware para tratar requisições OPTIONS (CORS Preflight).
     */
    app.options(/.*/, cors(corsOptions));

    /**
     * Middleware para parsear JSON nas requisições, com limite de tamanho.
     */
    app.use(express.json({ limit: process.env.BODY_LIMIT || '256kb', strict: true }));
    app.use(express.urlencoded({ extended: false, limit: process.env.BODY_LIMIT || '256kb' }));
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
    /**
     * Limite geral: protege contra varredura e uso abusivo da API.
     * O healthcheck fica fora para não interferir no monitoramento do Docker.
     */
    const generalLimit = rateLimit({
        windowMs: 60_000,
        max: Number(process.env.RATE_LIMIT_GENERAL_MAX || 120),
        name: 'geral',
    });

    /**
     * Limite estrito para rotas que acionam hardware ou disparam notificações.
     * Estes são os endpoints cujo abuso tem consequência física.
     */
    const commandLimit = rateLimit({
        windowMs: 60_000,
        max: Number(process.env.RATE_LIMIT_COMMAND_MAX || 15),
        name: 'comando',
    });

    app.use('/v2/api', healthRoutes);

    app.use('/v2/api/control', commandLimit);
    app.use('/v2/api/exhausts', commandLimit);
    app.use('/v2/api/cie/commands', commandLimit);
    app.use('/v2/api/push/send', commandLimit);
    app.use('/v2/api/push/events', commandLimit);
    app.use('/v2/api/access/register', commandLimit);

    app.use('/v2/api', generalLimit);

    app.use('/v2/api', accessRoutes);
    app.use('/v2/api', vehicleRoutes);
    app.use('/v2/api', vehicleV2Routes);
    app.use('/v2/api', exhaustRoutes);
    app.use('/v2/api', queryRoutes);
    app.use('/v2/api', controlRoutes);
    app.use('/v2/api', userSettingsRoutes);
    app.use('/v2/api', commandLogRoutes);
    app.use('/v2/api', cieGatewayRoutes);
    app.use('/v2/api', pushRoutes);

    /**
     * Documentação Swagger.
     *
     * Desabilitada por padrão: o spec cataloga todos os endpoints, incluindo
     * os que acionam portões e a central de incêndio. Habilitar apenas em
     * desenvolvimento, via SWAGGER_ENABLED=true.
     */
    const swaggerGuard = requireFlag('SWAGGER_ENABLED', 'Not Found');

    app.use('/v2/swagger', swaggerGuard, swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerUiOptions));

    app.get('/v2/apispec_1.json', swaggerGuard, (_req, res) => {
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

