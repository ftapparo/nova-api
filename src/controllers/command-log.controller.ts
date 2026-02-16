import { Request, Response } from 'express';
import { listCommandLogs } from '../services/command-log.service';

const parseLimit = (value: unknown): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 20;
    }
    return Math.min(Math.trunc(parsed), 200);
};

export const listCommandLogsController = (req: Request, res: Response): void => {
    try {
        const limit = parseLimit(req.query.limit);
        const logs = listCommandLogs(limit);

        res.ok({
            total: logs.length,
            limit,
            logs,
        });
    } catch (error: any) {
        res.fail('Erro ao consultar historico de comandos.', 500, error?.message ?? error);
    }
};
