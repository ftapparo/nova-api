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
    person: z.object({
        sequencia: z.number().int(),
        nome: z.string(),
        /** CPF mascarado ("•••.456.789-••") para a tela de dados pessoais; nulo se ausente ou inválido no cadastro. */
        cpfMasked: z.string().nullable(),
    }).nullable(),
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

// Vínculo automático (CPF + celular). Os dois só servem para conferir o
// cadastro e nunca são gravados.
export const selfLinkCheckBodySchema = z.object({
    cpf: z.string().trim().min(11).max(14),
    phone: z.object({
        /** DDI sem "+" (ex.: "55", "351"). */
        ddi: z.string().trim().regex(/^\d{1,4}$/),
        /** Número sem DDI; no Brasil, DDD + número. */
        number: z.string().trim().min(6).max(20),
    }),
});

export const selfLinkCheckSchema = z.object({
    /** Token de uso único para confirmar o vínculo (10 minutos). */
    confirmation: z.string(),
    /** Nome e CPF mascarados: a conferência não revela o cadastro inteiro a quem só sabe CPF e celular. */
    person: z.object({ nomeMasked: z.string(), cpfMasked: z.string().nullable() }),
    units: z.array(residenceUnitSchema),
});

export const selfLinkConfirmBodySchema = z.object({
    confirmation: z.string().min(10).max(100),
});
