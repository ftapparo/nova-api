import { Request, Response } from 'express';
import { configureExhaustModule, getAllModulesStatus, getExhaustMemory, getExhaustProcessStatus, getExhaustStatus, turnOffExhaust, turnOnExhaust } from '../services/exhaust.service';

type ExhaustPayload = {
    bloco?: string;
    apartamento?: string | number;
    tempo?: string | number;
    id?: string;
};

type ExhaustConfigPayload = {
    modulo?: string | number;
    comando?: string;
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
 * Extrai o ID do exhaust a partir do body.
 * @param payload Body da requisição.
 */
const resolveExhaustId = (payload: ExhaustPayload): string | null => {
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
 * @param memory Estado do exhaust.
 */
const serializeMemory = (memory: ReturnType<typeof getExhaustMemory>) => {
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
 * Liga um exhaust.
 * @param req Requisição HTTP.
 * @param res Resposta HTTP.
 */
export const turnOnExhaustController = async (req: Request, res: Response) => {
    const payload = req.body as ExhaustPayload;
    const id = resolveExhaustId(payload);
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
        const result = await turnOnExhaust(id, minutes);
        const memory = serializeMemory(getExhaustMemory(id));
        res.ok({
            id,
            status: 'on',
            autoOffMinutes: minutes ?? null,
            result,
            memory,
        });
    } catch (error: any) {
        console.error('Erro ao ligar exhaust:', error.message || error);
        res.fail('Erro ao ligar exhaust', error.status || 500, error.message ?? error);
    }
};

/**
 * Desliga um exhaust.
 * @param req Requisição HTTP.
 * @param res Resposta HTTP.
 */
export const turnOffExhaustController = async (req: Request, res: Response) => {
    const payload = req.body as ExhaustPayload;
    const id = resolveExhaustId(payload);

    if (!id) {
        res.fail('Parâmetros obrigatórios: bloco e apartamento.', 400);
        return;
    }

    try {
        const result = await turnOffExhaust(id);
        res.ok({
            id,
            status: 'off',
            result,
        });
    } catch (error: any) {
        console.error('Erro ao desligar exhaust:', error.message || error);
        res.fail('Erro ao desligar exhaust', error.status || 500, error.message ?? error);
    }
};

/**
 * Obtém o status de todos os módulos e memória de acionamentos.
 * @param req Requisição HTTP.
 * @param res Resposta HTTP.
 */
export const getExhaustStatusController = async (req: Request, res: Response) => {
    try {
        const paramId = typeof req.params.id === 'string' ? req.params.id : undefined;
        const queryId = typeof req.query.id === 'string' ? req.query.id : undefined;
        const id = paramId || queryId;

        if (id) {
            const result = await getExhaustStatus(id);
            res.ok(result);
            return;
        }

        const result = await getAllModulesStatus();
        res.ok(result);
    } catch (error: any) {
        console.error('Erro ao consultar status do exhaust:', error.message || error);
        res.fail('Erro ao consultar status do exhaust', error.status || 500, error.message ?? error);
    }
};

/**
 * Obtém o status do processo da API (memória de relés).
 * @param req Requisição HTTP.
 * @param res Resposta HTTP.
 */
export const getExhaustProcessStatusController = (_req: Request, res: Response) => {
    try {
        const result = getExhaustProcessStatus();
        res.ok(result);
    } catch (error: any) {
        console.error('Erro ao consultar status do processo:', error.message || error);
        res.fail('Erro ao consultar status do processo', error.status || 500, error.message ?? error);
    }
};

/**
 * Configura um módulo via backlog.
 * @param req Requisição HTTP.
 * @param res Resposta HTTP.
 */
export const configureExhaustController = async (req: Request, res: Response) => {
    const payload = req.body as ExhaustConfigPayload;
    const modulo = payload.modulo !== undefined && payload.modulo !== null ? String(payload.modulo).trim() : '';
    const comando = payload.comando ? String(payload.comando).trim() : '';

    if (!modulo || !comando) {
        res.fail('Parâmetros obrigatórios: módulo e comando.', 400);
        return;
    }

    try {
        const result = await configureExhaustModule(modulo, comando);
        res.ok(result);
    } catch (error: any) {
        console.error('Erro ao configurar módulo:', error.message || error);
        res.fail('Erro ao configurar módulo', error.status || 500, error.message ?? error);
    }
};
