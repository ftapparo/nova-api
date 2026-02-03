import { Request, Response } from 'express';
import { getExaustorMemory, getExaustorStatus, turnOffExaustor, turnOnExaustor } from '../services/exaustor.service';

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
 * Liga um exaustor.
 * @param req Requisição HTTP.
 * @param res Resposta HTTP.
 */
export const turnOnExaustorController = async (req: Request, res: Response) => {
    const { id } = req.params;
    const minutes = parseMinutes(req.query.minutes ?? req.body?.minutes);

    if (!id) {
        res.fail('ID do exaustor é obrigatório.', 400);
        return;
    }

    if (Number.isNaN(minutes)) {
        res.fail('Parâmetro minutes inválido.', 400);
        return;
    }

    try {
        const result = await turnOnExaustor(id, minutes);
        const memory = getExaustorMemory(id);
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
    const { id } = req.params;

    if (!id) {
        res.fail('ID do exaustor é obrigatório.', 400);
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
 * Obtém o status de um exaustor ou módulo.
 * @param req Requisição HTTP.
 * @param res Resposta HTTP.
 */
export const getExaustorStatusController = async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
        res.fail('ID do exaustor é obrigatório.', 400);
        return;
    }

    try {
        const result = await getExaustorStatus(id);
        res.ok({
            id,
            result,
        });
    } catch (error: any) {
        console.error('Erro ao consultar status do exaustor:', error.message || error);
        res.fail('Erro ao consultar status do exaustor', error.status || 500, error.message ?? error);
    }
};
