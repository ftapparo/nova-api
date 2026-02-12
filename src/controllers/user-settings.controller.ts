import { Request, Response } from 'express';
import { readUserSettings, writeUserSettings } from '../repositories/user-settings.repository';

const normalizeUser = (value: unknown): string => String(value ?? '').trim().toUpperCase();

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== 'object') return false;
    return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
};

export const getUserSettingsControl = async (req: Request, res: Response): Promise<void> => {
    const user = normalizeUser(req.params.user);
    if (!user) {
        res.fail('Usuário é obrigatório.', 400);
        return;
    }

    try {
        const data = await readUserSettings(user);
        if (!data) {
            res.ok({
                user,
                exists: false,
                updatedAt: 0,
                items: {},
            });
            return;
        }

        res.ok({
            ...data,
            exists: true,
        });
    } catch (error: any) {
        console.error('[UserSettingsController] Erro ao carregar configurações:', error?.message ?? error);
        res.fail('Erro ao carregar configurações do usuário.', error?.status || 500, error?.message ?? error);
    }
};

export const upsertUserSettingsControl = async (req: Request, res: Response): Promise<void> => {
    const user = normalizeUser(req.params.user);
    if (!user) {
        res.fail('Usuário é obrigatório.', 400);
        return;
    }

    const body = req.body;
    const rawItems = isPlainObject(body) ? body.items : null;

    if (!isPlainObject(rawItems)) {
        res.fail('O campo "items" é obrigatório e deve ser um objeto.', 400);
        return;
    }

    const items: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawItems)) {
        if (typeof value === 'string') {
            items[key] = value;
        }
    }

    const rawUpdatedAt = isPlainObject(body) ? body.updatedAt : undefined;
    const updatedAt = typeof rawUpdatedAt === 'number' && Number.isFinite(rawUpdatedAt) && rawUpdatedAt > 0
        ? Math.trunc(rawUpdatedAt)
        : Date.now();

    try {
        const data = await writeUserSettings(user, { updatedAt, items });
        res.ok({
            ...data,
            exists: true,
        });
    } catch (error: any) {
        console.error('[UserSettingsController] Erro ao salvar configurações:', error?.message ?? error);
        res.fail('Erro ao salvar configurações do usuário.', error?.status || 500, error?.message ?? error);
    }
};
