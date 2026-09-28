import { z } from 'zod';

export const RESIDENCE_STATUSES = ['pendente', 'ativo', 'sem-unidade'] as const;

export const UNIT_BLOCK_REASONS = ['nao-morador', 'unidade-com-inquilino', 'cadastro-inconsistente'] as const;

export const residenceUnitSchema = z.object({
    sequencia: z.number().int(),
    quadra: z.string(),
    lote: z.string(),
    /** Rótulo pronto para exibir, ex.: "A-124". */
    label: z.string(),
    morador: z.boolean(),
    proprietario: z.boolean(),
    locatario: z.boolean(),
    /** true = o app mostra a unidade, mas desativa toda ação nela. */
    blocked: z.boolean(),
    blockedReason: z.enum(UNIT_BLOCK_REASONS).nullable(),
});
export type ResidenceUnit = z.infer<typeof residenceUnitSchema>;

export const residenceSchema = z.object({
    status: z.enum(RESIDENCE_STATUSES),
    /** true quando nenhuma unidade está liberada — app todo desativado. */
    blocked: z.boolean(),
    person: z.object({ sequencia: z.number().int(), nome: z.string() }).nullable(),
    units: z.array(residenceUnitSchema),
});
export type Residence = z.infer<typeof residenceSchema>;

export const linkParamsSchema = z.object({
    accountId: z.uuid(),
});

export const linkBodySchema = z.object({
    personSequencia: z.number().int().positive(),
});

export const linkSchema = z.object({
    accountId: z.string(),
    personSequencia: z.number().int(),
    linkedBy: z.string(),
    linkedAt: z.iso.datetime(),
});
