import axios, { AxiosError } from 'axios';
import { Request, Response } from 'express';
import { getAccessControlStatusCache } from '../services/access-control.service';
import { getDoorById, getGateByNumeroDispositivo, listAvailableDoors, listAvailableGates } from '../repositories/control.repository';

const CONTROL_BASE_URL = process.env.CONTROL_BASE_URL?.trim();
const CONTROL_TIMEOUT_MS = Number(process.env.CONTROL_TIMEOUT_MS || '5000');
const TAG_CONTROL_HOST = process.env.TAG_CONTROL_HOST?.trim() || '192.168.0.252';
const TAG_CONTROL_BASE_PORT = Number(process.env.TAG_CONTROL_BASE_PORT || '4000');

if (!CONTROL_BASE_URL) {
    console.error('[ControlController] CONTROL_BASE_URL não configurada.');
}

const resolveControlTimeout = (): number => {
    if (Number.isNaN(CONTROL_TIMEOUT_MS) || CONTROL_TIMEOUT_MS <= 0) {
        return 5000;
    }

    return CONTROL_TIMEOUT_MS;
};

const resolveTagBasePort = (): number => {
    if (Number.isNaN(TAG_CONTROL_BASE_PORT) || TAG_CONTROL_BASE_PORT <= 0) {
        return 4000;
    }

    return TAG_CONTROL_BASE_PORT;
};

const buildGateBaseUrl = (numeroDispositivo: number): { url: string; port: number } => {
    const basePort = resolveTagBasePort();
    const port = basePort + numeroDispositivo;

    return {
        url: `http://${TAG_CONTROL_HOST}:${port}`,
        port,
    };
};


const mapAxiosError = (error: unknown) => {
    if (!axios.isAxiosError(error)) {
        return { status: 500, message: 'Erro inesperado ao chamar serviço de controle.', details: error };
    }

    const axiosError = error as AxiosError;
    const status = axiosError.response?.status || 502;
    const message = axiosError.response?.data || axiosError.message;

    return { status, message, details: axiosError.response?.data ?? axiosError.message };
};

const resolveIdNumber = (value: unknown): number | null => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return NaN;
    }

    return parsed;
};

/**
 * Aciona abertura do portão via serviço externo.
 * @param req Requisição HTTP (body/query repassados).
 * @param res Resposta HTTP.
 */
export const openGateControl = async (req: Request, res: Response): Promise<void> => {
    const idValue = resolveIdNumber(req.body?.id ?? req.query?.id);

    if (idValue === null) {
        res.fail('Parâmetro id é obrigatório.', 400);
        return;
    }

    if (Number.isNaN(idValue)) {
        res.fail('Parâmetro id inválido.', 400);
        return;
    }

    try {
        const gate = await getGateByNumeroDispositivo(idValue);

        if (!gate) {
            res.fail('Portão não encontrado ou inativo.', 404);
            return;
        }

        const autoCloseRaw = req.body?.autoCloseTime ?? req.query?.autoCloseTime;
        const autoCloseParsed = autoCloseRaw !== undefined && autoCloseRaw !== null && autoCloseRaw !== ''
            ? Number(autoCloseRaw)
            : undefined;

        if (autoCloseParsed !== undefined && (!Number.isFinite(autoCloseParsed) || autoCloseParsed <= 0)) {
            res.fail('Parâmetro autoCloseTime inválido.', 400);
            return;
        }

        const baseUrl = buildGateBaseUrl(gate.numeroDispositivo);
        const url = `${baseUrl.url}/v2/api/gate/open`;
        const response = await axios.post(url, {
            autoCloseTime: autoCloseParsed ?? 15,
        }, {
            timeout: resolveControlTimeout(),
        });

        res.ok({
            id: gate.numeroDispositivo,
            port: baseUrl.port,
            response: response.data,
        });
    } catch (error: unknown) {
        const mapped = mapAxiosError(error);
        console.error('[ControlController] Erro ao abrir portão:', mapped.details);
        res.fail('Erro ao acionar abertura do portão.', mapped.status, mapped.message);
    }
};

/**
 * Reinicia o controle do portão via serviço TAG.
 * @param req Requisição HTTP (id via body/query).
 * @param res Resposta HTTP.
 */
export const restartGateControl = async (req: Request, res: Response): Promise<void> => {
    const idValue = resolveIdNumber(req.body?.id ?? req.query?.id);

    if (idValue === null) {
        res.fail('Parâmetro id é obrigatório.', 400);
        return;
    }

    if (Number.isNaN(idValue)) {
        res.fail('Parâmetro id inválido.', 400);
        return;
    }

    try {
        const gate = await getGateByNumeroDispositivo(idValue);

        if (!gate) {
            res.fail('Portão não encontrado ou inativo.', 404);
            return;
        }

        const baseUrl = buildGateBaseUrl(gate.numeroDispositivo);
        const url = `${baseUrl.url}/v2/api/gate/restart`;
        const response = await axios.post(url, null, {
            timeout: resolveControlTimeout(),
        });

        res.ok({
            id: gate.numeroDispositivo,
            port: baseUrl.port,
            response: response.data,
        });
    } catch (error: unknown) {
        const mapped = mapAxiosError(error);
        console.error('[ControlController] Erro ao reiniciar portão:', mapped.details);
        res.fail('Erro ao reiniciar portão.', mapped.status, mapped.message);
    }
};

/**
 * Lista portas disponíveis para controle.
 * @param _req Requisição HTTP.
 * @param res Resposta HTTP.
 */
export const listDoorsControl = async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await listAvailableDoors();
        res.ok(result);
    } catch (error: unknown) {
        console.error('[ControlController] Erro ao listar portas:', error);
        res.fail('Erro ao listar portas.', 500, error instanceof Error ? error.message : error);
    }
};

/**
 * Lista portões disponíveis para controle por TAG.
 * @param _req Requisição HTTP.
 * @param res Resposta HTTP.
 */
export const listGatesControl = async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await listAvailableGates();
        res.ok(result);
    } catch (error: unknown) {
        console.error('[ControlController] Erro ao listar portões:', error);
        res.fail('Erro ao listar portões.', 500, error instanceof Error ? error.message : error);
    }
};

/**
 * Aciona abertura da porta via dispositivo facial.
 * @param req Requisição HTTP (id via body/query).
 * @param res Resposta HTTP.
 */
export const openDoorControl = async (req: Request, res: Response): Promise<void> => {
    const idValue = resolveIdNumber(req.body?.id ?? req.query?.id);

    if (idValue === null) {
        res.fail('Parâmetro id é obrigatório.', 400);
        return;
    }

    if (Number.isNaN(idValue)) {
        res.fail('Parâmetro id inválido.', 400);
        return;
    }

    try {
        const door = await getDoorById(idValue);

        if (!door) {
            res.fail('Porta não encontrada ou inativa.', 404);
            return;
        }

        if (!door.ip) {
            res.fail('IP da porta não configurado.', 400);
            return;
        }

        if (!door.usuarioApi || !door.senhaApi) {
            res.fail('Credenciais da porta não configuradas.', 400);
            return;
        }

        const url = `http://${door.ip}/action/OpenDoor`;
        const requestBody = {
            operator: 'OpenDoor',
            info: {
                DeviceID: door.deviceId.toString(),
                CHN: 0,
                status: 1,
                msg: '',
            },
        };

        const authHeader = `Basic ${Buffer.from(`${door.usuarioApi}:${door.senhaApi}`).toString('base64')}`;
        const response = await axios.post(url, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: authHeader,
            },
            timeout: resolveControlTimeout(),
        });

        res.ok({
            id: door.sequencia,
            porta: door.porta,
            deviceId: door.deviceId,
            response: response.data,
        });
    } catch (error: unknown) {
        const mapped = mapAxiosError(error);
        console.error('[ControlController] Erro ao abrir porta:', mapped.details);
        res.fail('Erro ao acionar abertura da porta.', mapped.status, mapped.message);
    }
};

/**
 * Consulta status de portões (healthcheck) e portas (GET simples no IP).
 * @param _req Requisição HTTP.
 * @param res Resposta HTTP.
 */
export const statusGatesAndDoorsControl = async (_req: Request, res: Response): Promise<void> => {
    try {
        const cache = getAccessControlStatusCache();
        res.ok(cache);
    } catch (error: unknown) {
        console.error('[ControlController] Erro ao consultar status de portões e portas:', error);
        res.fail('Erro ao consultar status de portões e portas.', 500, error instanceof Error ? error.message : error);
    }
};
