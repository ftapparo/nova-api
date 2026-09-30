import { z } from 'zod';

// Schemas Zod espelhando os tipos de src/core/tag-validator.ts e
// src/core/antenna-manager.ts. Mantidos separados do domínio (core/) de
// propósito: v3 é a única camada que precisa validar/documentar formato
// via Zod.

export const gateStateSchema = z.object({
    state: z.enum(['closed', 'opening', 'open', 'closing', 'unknown']),
    // true = travado aberto, sem fechamento automático. Opcional só para
    // tolerar um nova-tag ainda sem esse campo durante o redeploy.
    keepOpen: z.boolean().optional(),
});

// AccessVerifyData: dados retornados pela API de verificação de acesso,
// incluem PII (NOME, QUADRA, LOTE) — rota protegida por token de serviço.
export const accessVerifyDataSchema = z.object({
    PERMITIDO: z.string().optional(),
    SEQPESSOA: z.union([z.string(), z.number()]).optional(),
    SEQCLASSIFICACAO: z.union([z.string(), z.number()]).optional(),
    CLASSIFAUTORIZADA: z.string().optional(),
    AUTORIZACAOLANC: z.string().optional(),
    TIPO: z.string().optional(),
    SEQIDACESSO: z.union([z.string(), z.number()]).optional(),
    QUADRA: z.string().optional(),
    LOTE: z.string().optional(),
    PANICO: z.string().optional(),
    MIDIA: z.string().optional(),
    IDENT: z.string().optional(),
    SEQVEICULO: z.union([z.string(), z.number()]).optional(),
    NOME: z.string().optional(),
    DESCRICAO: z.string().optional(),
});

export const tagCacheItemSchema = z.object({
    tag: z.string(),
    validatedAt: z.coerce.date(),
    isValid: z.boolean(),
    accessId: z.string().optional(),
    verifyData: accessVerifyDataSchema.optional(),
});

export const cacheStatsSchema = z.object({
    positiveSize: z.number(),
    negativeSize: z.number(),
    positiveTimeout: z.number(),
    negativeTimeout: z.number(),
});

export const listCacheDataSchema = z.object({
    type: z.enum(['positive', 'negative', 'all']),
    items: z.array(tagCacheItemSchema),
    stats: cacheStatsSchema,
});

export const cacheTypeQuerySchema = z.enum(['positive', 'negative', 'all', 'whitelist', 'blacklist']);

// -----------------------------------------------------------------------------
// Portões cadastrados e status (lidos do Firebird / cache da própria API)
// -----------------------------------------------------------------------------

// Só o que a equipe precisa ver: IP/porta ficam de fora (endereço interno).
export const gateSchema = z.object({
    numeroDispositivo: z.number(),
    nome: z.string(),
    sentido: z.string(),
    ativo: z.boolean(),
});

export const gateStatusSchema = z.object({
    numeroDispositivo: z.number(),
    nome: z.string(),
    sentido: z.string(),
    online: z.boolean(),
});

export const gatesStatusDataSchema = z.object({
    updatedAt: z.string().nullable(),
    gates: z.array(gateStatusSchema),
});

// -----------------------------------------------------------------------------
// Comandos (proxy para a v3 do nova-tag)
// -----------------------------------------------------------------------------

export const numeroDispositivoQuerySchema = z.object({
    numeroDispositivo: z.coerce.number().int().positive(),
});

// O nova-tag repete estas regras; aqui só o formato, o teto de
// autoCloseTime é dele (GATE_AUTO_CLOSE_MAX).
export const openGateBodySchema = z.object({
    numeroDispositivo: z.number().int().positive(),
    autoCloseTime: z.number().int().min(1).optional(),
    keepOpen: z.literal(true).optional(),
}).strict().refine((body) => !(body.autoCloseTime !== undefined && body.keepOpen), {
    message: 'Use autoCloseTime ou keepOpen, não os dois.',
    path: ['keepOpen'],
});

export const gateDeviceBodySchema = z.object({
    numeroDispositivo: z.number().int().positive(),
}).strict();

export const restartGateBodySchema = z.object({
    numeroDispositivo: z.number().int().positive(),
    confirm: z.boolean().optional(),
}).strict();

export const gateCommandResultSchema = z.object({
    action: z.enum(['open', 'close']),
    autoCloseSeconds: z.number().nullable(),
    gate: gateStateSchema,
});

export const restartResultSchema = z.object({
    message: z.string(),
    shutdownDelayMs: z.number(),
});

export const clearCacheResultSchema = z.object({
    type: z.enum(['positive', 'negative', 'all']),
    stats: cacheStatsSchema,
});

export const removeCacheItemResultSchema = z.object({ tag: z.string() });
