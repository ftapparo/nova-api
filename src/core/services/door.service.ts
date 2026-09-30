import axios from 'axios';
import type { DoorDevice } from '../repositories/control.repository';

// =============================================================================
// Abertura de porta pelo leitor facial: POST direto no IP do equipamento,
// com Basic auth cadastrada no Firebird (USUARIO_API/SENHA_API).
//
// Cópia do protocolo que vive em v2/controllers/control.controller.ts (a
// v2 não pode ser editada). Quando a v2 sair, esta passa a ser a única.
// =============================================================================

/** Erro de abertura com status HTTP sugerido para a camada de API. */
export class DoorOpenError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'DoorOpenError';
        this.status = status;
    }
}

// Lida dentro da função: imports resolvem antes do dotenv.config().
const resolveTimeout = (): number => {
    const value = Number(process.env.CONTROL_TIMEOUT_MS || '5000');
    return Number.isFinite(value) && value > 0 ? value : 5000;
};

export const openDoor = async (door: DoorDevice): Promise<unknown> => {
    if (!door.ip) throw new DoorOpenError('IP da porta não configurado.', 409);
    if (!door.usuarioApi || !door.senhaApi) throw new DoorOpenError('Credenciais da porta não configuradas.', 409);

    try {
        const response = await axios.post(`http://${door.ip}/action/OpenDoor`, {
            operator: 'OpenDoor',
            info: { DeviceID: door.deviceId.toString(), CHN: 0, status: 1, msg: '' },
        }, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${Buffer.from(`${door.usuarioApi}:${door.senhaApi}`).toString('base64')}`,
            },
            timeout: resolveTimeout(),
        });
        return response.data;
    } catch (error: unknown) {
        // Sem repassar o corpo do equipamento: pode conter detalhes internos.
        const status = axios.isAxiosError(error) && error.response ? 502 : 503;
        throw new DoorOpenError(status === 503 ? 'Porta inacessível.' : 'A porta recusou o comando.', status);
    }
};
