import { Request, Response } from 'express';
import { getAllModulesStatus, getExaustorMemory, turnOffExaustor, turnOnExaustor } from '../services/exaustor.service';

type ExaustorPayload = {
    bloco?: string;
    apartamento?: string | number;
    tempo?: string | number;
    id?: string;
};

/**
 * Converte o parâmetro de minutos em número.
 * @param value Valor recebido (query/body).
 */
const parseMinutes = (value: unknown): number | undefined => {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return NaN;
    }

    return parsed;
};

/**
 * Extrai o ID do exaustor a partir do body.
 * @param payload Body da requisição.
 */
const resolveExaustorId = (payload: ExaustorPayload): string | null => {
    if (payload.id) {
        return String(payload.id).trim();
    }

    const bloco = payload.bloco ? String(payload.bloco).trim().toUpperCase() : '';
    const apartamento = payload.apartamento !== undefined && payload.apartamento !== null
        ? String(payload.apartamento).trim()
        : '';

    if (!bloco || !apartamento) {
        return null;
    }

    const lastDigitMatch = apartamento.match(/(\d)\D*$/);
    if (!lastDigitMatch) {
        return null;
    }

    return `${bloco}${lastDigitMatch[1]}`;
};

/**
 * Remove propriedades não serializáveis do estado em memória.
 * @param memory Estado do exaustor.
 */
const serializeMemory = (memory: ReturnType<typeof getExaustorMemory>) => {
    if (!memory) return null;

    return {
        id: memory.id,
        tower: memory.tower,
        final: memory.final,
        group: memory.group,
        relay: memory.relay,
        moduleId: memory.moduleId,
        expiresAt: memory.expiresAt,
    };
};

/**
 * Liga um exaustor.
 * @param req Requisição HTTP.
 * @param res Resposta HTTP.
 */
export const turnOnExaustorController = async (req: Request, res: Response) => {
    const payload = req.body as ExaustorPayload;
    const id = resolveExaustorId(payload);
    const minutes = parseMinutes(payload.tempo);

    if (!id) {
        res.fail('Parâmetros obrigatórios: bloco e apartamento.', 400);
        return;
    }

    if (Number.isNaN(minutes)) {
        res.fail('Parâmetro tempo inválido.', 400);
        return;
    }

    try {
        const result = await turnOnExaustor(id, minutes);
        const memory = serializeMemory(getExaustorMemory(id));
        res.ok({
            id,
            status: 'on',
            autoOffMinutes: minutes ?? null,
            result,
            memory,
        });
    } catch (error: any) {
        console.error('Erro ao ligar exaustor:', error.message || error);
        res.fail('Erro ao ligar exaustor', error.status || 500, error.message ?? error);
    }
};

/**
 * Desliga um exaustor.
 * @param req Requisição HTTP.
 * @param res Resposta HTTP.
 */
export const turnOffExaustorController = async (req: Request, res: Response) => {
    const payload = req.body as ExaustorPayload;
    const id = resolveExaustorId(payload);

    if (!id) {
        res.fail('Parâmetros obrigatórios: bloco e apartamento.', 400);
        return;
    }

    try {
        const result = await turnOffExaustor(id);
        res.ok({
            id,
            status: 'off',
            result,
        });
    } catch (error: any) {
        console.error('Erro ao desligar exaustor:', error.message || error);
        res.fail('Erro ao desligar exaustor', error.status || 500, error.message ?? error);
    }
};

/**
 * Obtém o status de todos os módulos e memória de acionamentos.
 * @param req Requisição HTTP.
 * @param res Resposta HTTP.
 */
export const getExaustorStatusController = async (req: Request, res: Response) => {
    try {
        const result = await getAllModulesStatus();
        res.ok(result);
    } catch (error: any) {
        console.error('Erro ao consultar status do exaustor:', error.message || error);
        res.fail('Erro ao consultar status do exaustor', error.status || 500, error.message ?? error);
    }
};
