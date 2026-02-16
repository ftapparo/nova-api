import { NextFunction, Request, Response } from 'express';
import { appendCommandLog, type CommandLogEntry } from '../services/command-log.service';

const COMMAND_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const toCommand = (req: Request): string => {
    const original = (req.originalUrl || req.url || '').split('?')[0];
    return `${req.method.toUpperCase()} ${original}`;
};

export const commandAuditMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (!COMMAND_METHODS.has(req.method.toUpperCase())) {
        next();
        return;
    }

    const startedAt = new Date();
    const actor = req.actor || 'desconhecido';
    const requestId = req.requestId || null;
    const command = toCommand(req);
    const path = (req.originalUrl || req.url || '').split('?')[0];
    const ip = req.ip || req.socket?.remoteAddress || null;

    res.on('finish', () => {
        const entry: CommandLogEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            timestamp: startedAt.toISOString(),
            requestId,
            method: req.method.toUpperCase(),
            path,
            command,
            status: res.statusCode,
            actor,
            ip,
        };

        appendCommandLog(entry);
    });

    next();
};
