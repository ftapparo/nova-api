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
