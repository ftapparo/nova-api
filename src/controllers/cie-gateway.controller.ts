import axios, { AxiosError, Method } from 'axios';
import { Request, Response } from 'express';

const CIE_GATEWAY_BASE_URL = (process.env.CIE_GATEWAY_BASE_URL || 'http://192.168.0.250:4021/v1/api').trim().replace(/\/+$/, '');
const CIE_GATEWAY_TIMEOUT_MS = Number(process.env.CIE_GATEWAY_TIMEOUT_MS || '5000');

const resolveTimeout = (): number => {
    if (!Number.isFinite(CIE_GATEWAY_TIMEOUT_MS) || CIE_GATEWAY_TIMEOUT_MS <= 0) {
        return 5000;
    }

    return CIE_GATEWAY_TIMEOUT_MS;
};

const mapAxiosError = (error: unknown) => {
    if (!axios.isAxiosError(error)) {
        return {
            status: 500,
            message: 'Erro inesperado ao chamar serviço CIE.',
            details: error,
        };
    }

    const axiosError = error as AxiosError;
    const status = axiosError.response?.status || 502;
    const message = axiosError.response?.data || axiosError.message;

    return { status, message, details: axiosError.response?.data ?? axiosError.message };
};

const proxyCieRequest = async (
    req: Request,
    res: Response,
    method: Method,
    path: string,
    options?: { body?: unknown; params?: Record<string, unknown> }
): Promise<void> => {
    try {
        const url = `${CIE_GATEWAY_BASE_URL}${path}`;
        const response = await axios.request({
            method,
            url,
            params: options?.params,
            data: options?.body,
            timeout: resolveTimeout(),
            headers: {
                'x-user': req.actor || req.headers['x-user'] || 'API',
                'x-request-id': req.requestId || req.headers['x-request-id'],
            },
        });

        const payload = response.data && typeof response.data === 'object' && 'data' in response.data
            ? (response.data as { data: unknown }).data
            : response.data;

        res.ok(payload as unknown);
    } catch (error: unknown) {
        const mapped = mapAxiosError(error);
        console.error('[CieGatewayController] Erro no proxy CIE:', { path, method, details: mapped.details });
        res.fail(`Erro ao chamar rota CIE: ${path}`, mapped.status, mapped.message);
    }
};

export const ciePanelGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'GET', '/cie/panel');

export const cieStatusGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'GET', '/cie/status');

export const cieAlarmsActiveGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'GET', '/cie/alarms/active');

export const cieLogsGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'GET', '/cie/logs', {
        params: {
            type: req.query.type,
            limit: req.query.limit,
            cursor: req.query.cursor,
        },
    });

export const cieBlockCountersGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'GET', '/cie/counters/blocks');

export const cieOutputCountersGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'GET', '/cie/counters/outputs');

export const cieCommandSilenceBipGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'POST', '/cie/commands/silence-bip');

export const cieCommandAlarmGeneralGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'POST', '/cie/commands/alarm-general');

export const cieCommandSilenceSirenGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'POST', '/cie/commands/silence-siren');

export const cieCommandRestartGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'POST', '/cie/commands/restart');

export const cieCommandSilenceGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'POST', '/cie/commands/silence');

export const cieCommandReleaseGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'POST', '/cie/commands/release');

export const cieCommandBrigadeSirenGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'POST', '/cie/commands/brigade-siren');

export const cieCommandDelaySirenGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'POST', '/cie/commands/delay-siren');

export const cieCommandBlockGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'POST', '/cie/commands/block', { body: req.body });

export const cieCommandOutputGateway = async (req: Request, res: Response): Promise<void> =>
    proxyCieRequest(req, res, 'POST', '/cie/commands/output', { body: req.body });

