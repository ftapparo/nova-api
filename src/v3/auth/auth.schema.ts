import { z } from 'zod';
import { APP_ROLES } from '../shared/require-auth';

export const loginBodySchema = z.object({
    email: z.email().max(254),
    // Limite superior só para não repassar payload arbitrário ao Auth;
    // a política de senha em si é do Supabase Auth.
    password: z.string().min(1).max(256),
});

export const refreshBodySchema = z.object({
    refreshToken: z.string().min(1).max(512),
});

export const authUserSchema = z.object({
    id: z.string(),
    email: z.string().nullable(),
    role: z.enum(APP_ROLES).nullable(),
    /** Senha provisória: o app deve levar direto para a troca de senha. */
    mustChangePassword: z.boolean(),
});

export const sessionDataSchema = z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('bearer'),
    expiresIn: z.number().int(),
    expiresAt: z.number().int(),
    user: authUserSchema,
});
export type SessionData = z.infer<typeof sessionDataSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;

export const createUserBodySchema = z.object({
    email: z.email().max(254),
    // Mínimo da aplicação; o GoTrue pode aplicar política própria por cima.
    password: z.string().min(8).max(256),
    role: z.enum(APP_ROLES),
});

// Cadastro público: sem `role` no corpo de propósito — o papel é sempre
// definido pela API, nunca pelo cliente.
export const signupBodySchema = createUserBodySchema.omit({ role: true });

export const listUsersQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(50),
});

export const googleLoginBodySchema = z.object({
    // id_token do Google é um JWT (~1-2 KB); limite só para não repassar lixo.
    idToken: z.string().min(1).max(4096),
    // Só quando o app gerou nonce no login do Google (iOS costuma). Enviar
    // um nonce que não está no token faz o GoTrue recusar.
    nonce: z.string().min(1).max(256).optional(),
});

const newPasswordSchema = z.string().min(8).max(256);

export const changePasswordBodySchema = z.object({
    currentPassword: z.string().min(1).max(256),
    newPassword: newPasswordSchema,
});

export const staffResetPasswordBodySchema = z
    .object({
        accountId: z.uuid().optional(),
        personSequencia: z.number().int().positive().optional(),
    })
    .refine((body) => Boolean(body.accountId) !== Boolean(body.personSequencia), {
        message: 'Informe accountId ou personSequencia (um dos dois).',
    });

export const temporaryPasswordSchema = z.object({
    accountId: z.string(),
    email: z.string().nullable(),
    temporaryPassword: z.string(),
});

export const recoverBodySchema = z.object({
    email: z.email().max(254),
});

export const recoverConfirmBodySchema = z.object({
    email: z.email().max(254),
    code: z.string().regex(/^\d{6}$/, 'Código de 6 dígitos.'),
    newPassword: newPasswordSchema,
});
