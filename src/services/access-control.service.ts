import axios, { AxiosError } from 'axios';
import { listAvailableDoors, listAvailableGates } from '../repositories/control.repository';

export type GateStatus = {
    id: number;
    nome: string;
    numeroDispositivo: number;
    ip: string;
    porta: number;
    healthcheckUrl: string;
    online: boolean;
    statusCode: number | null;
    error: string | null;
};

export type DoorStatus = {
    id: number;
    nome: string;
    ip: string;
    porta: number;
    url: string | null;
    online: boolean;
    statusCode: number | null;
    error: string | null;
};

export type AccessControlStatusCache = {
    updatedAt: string | null;
    gates: GateStatus[];
    doors: DoorStatus[];
    error: string | null;
};

const CONTROL_TIMEOUT_MS = Number(process.env.CONTROL_TIMEOUT_MS || '5000');
const TAG_CONTROL_HOST = process.env.TAG_CONTROL_HOST?.trim() || '192.168.0.250';
const TAG_CONTROL_BASE_PORT = Number(process.env.TAG_CONTROL_BASE_PORT || '4000');
const ACCESS_CONTROL_STATUS_INTERVAL_MS = 60_000;

let accessControlStatusCache: AccessControlStatusCache = {
    updatedAt: null,
    gates: [],
    doors: [],
    error: 'Aguardando dados serem atualizados.',
};

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

const buildGateHealthcheckUrl = (numeroDispositivo: number): string => {
    const basePort = resolveTagBasePort();
    const targetPort = basePort + numeroDispositivo;

    return `http://${TAG_CONTROL_HOST}:${targetPort}/v2/api/healthcheck`;
};

const mapAxiosError = (error: unknown) => {
    if (!axios.isAxiosError(error)) {
        return { status: 500, message: 'Erro inesperado ao chamar servico de controle.' };
    }

    const axiosError = error as AxiosError;
    const status = axiosError.response?.status || 502;
    const message = axiosError.response?.data || axiosError.message;

    return { status, message };
};

const resolveHttpStatus = async (url: string): Promise<{ online: boolean; statusCode: number | null; error: string | null }> => {
    try {
        const response = await axios.get(url, {
            timeout: resolveControlTimeout(),
            validateStatus: () => true,
        });

        return {
            online: response.status === 200,
            statusCode: response.status,
            error: null,
        };
    } catch (error: unknown) {
        const mapped = mapAxiosError(error);
        const message = typeof mapped.message === 'string'
            ? mapped.message
            : JSON.stringify(mapped.message);

        return {
            online: false,
            statusCode: mapped.status,
            error: message,
        };
    }
};

const updateAccessControlStatusCache = async (): Promise<void> => {
    try {
        const [gates, doors] = await Promise.all([
            listAvailableGates(),
            listAvailableDoors(),
        ]);

        const gatesStatus = await Promise.all(gates.map(async (gate) => {
            const url = buildGateHealthcheckUrl(gate.numeroDispositivo);
            const status = await resolveHttpStatus(url);

            return {
                id: gate.sequencia,
                nome: gate.nome,
                numeroDispositivo: gate.numeroDispositivo,
                ip: gate.ip,
                porta: gate.porta,
                healthcheckUrl: url,
                online: status.online,
                statusCode: status.statusCode,
                error: status.error,
            } satisfies GateStatus;
        }));

        const doorsStatus = await Promise.all(doors.map(async (door) => {
            if (!door.ip) {
                return {
                    id: door.sequencia,
                    nome: door.nome,
                    ip: door.ip,
                    porta: door.porta,
                    url: null,
                    online: false,
                    statusCode: null,
                    error: 'IP da porta nao configurado.',
                } satisfies DoorStatus;
            }

            const url = `http://${door.ip}`;
            const status = await resolveHttpStatus(url);

            return {
                id: door.sequencia,
                nome: door.nome,
                ip: door.ip,
                porta: door.porta,
                url,
                online: status.online,
                statusCode: status.statusCode,
                error: status.error,
            } satisfies DoorStatus;
        }));

        accessControlStatusCache = {
            updatedAt: new Date().toISOString(),
            gates: gatesStatus,
            doors: doorsStatus,
            error: null,
        };
    } catch (error: unknown) {
        console.error('[AccessControlService] Erro ao atualizar cache de status:', error);
        accessControlStatusCache = {
            ...accessControlStatusCache,
            error: error instanceof Error ? error.message : String(error),
        };
    }
};

/**
 * Inicia o job de monitoramento de portões e portas a cada 1 minuto.
 * @returns void.
 */
export const startAccessControlService = async (): Promise<void> => {
    await updateAccessControlStatusCache();

    setInterval(() => {
        void updateAccessControlStatusCache();
    }, ACCESS_CONTROL_STATUS_INTERVAL_MS);

    console.log('[AccessControlService] Monitoramento de portões e portas iniciado.');
};

/**
 * Retorna o cache atual de status de portões e portas.
 * @returns Cache atual.
 */
export const getAccessControlStatusCache = (): AccessControlStatusCache => {
    return accessControlStatusCache;
};
