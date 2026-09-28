import { createHmac } from 'node:crypto';
import axios from 'axios';
import logger from '../../core/utils/logger';
import { toAppRole, type AppRole } from '../shared/require-auth';
import type { AuthUser, SessionData } from './auth.schema';

// =============================================================================
// Cliente do Supabase Auth (GoTrue) — container nova-auth, só na rede
// interna (sem porta publicada). A nova-api é a única porta de entrada:
// o navegador/app nunca fala com o GoTrue diretamente.
// =============================================================================

export type AuthFailure = 'invalid-credentials' | 'rate-limited' | 'unavailable';
export type AuthResult<T> = { ok: true; data: T } | { ok: false; reason: AuthFailure };

// Lidas dentro das funções: imports resolvem antes de dotenv.config().
const resolveAuthUrl = (): string => (process.env.AUTH_URL?.trim() || 'http://nova-auth:9999').replace(/\/+$/, '');

const resolveAuthTimeout = (): number => {
    const value = Number(process.env.AUTH_TIMEOUT_MS || '5000');
    return Number.isFinite(value) && value > 0 ? value : 5000;
};

type GoTrueSession = {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at?: number;
    user?: { id: string; email?: string | null; app_metadata?: Record<string, unknown> };
};

const toSessionData = (session: GoTrueSession): SessionData => ({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    tokenType: 'bearer',
    expiresIn: session.expires_in,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    user: {
        id: session.user?.id ?? '',
        email: session.user?.email ?? null,
        role: toAppRole(session.user?.app_metadata?.role),
    },
});

// O GoTrue responde 400 tanto para senha errada quanto para usuário
// inexistente ou refresh token revogado — tudo vira a mesma falha genérica,
// sem distinguir para o cliente (não revela quais e-mails existem).
const classifyError = (error: unknown, operation: string): AuthFailure => {
    if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status;
        if (status === 429) return 'rate-limited';
        if (status >= 400 && status < 500) return 'invalid-credentials';
        logger.error(`[ApiV3] Supabase Auth respondeu ${status} em ${operation}.`);
        return 'unavailable';
    }
    // Sem logar o objeto de erro inteiro: a config do axios carrega o corpo
    // da requisição (senha / refresh token).
    const message = error instanceof Error ? error.message : 'erro desconhecido';
    logger.error(`[ApiV3] Falha ao contatar o Supabase Auth em ${operation}: ${message}`);
    return 'unavailable';
};

const requestToken = async (grantType: 'password' | 'refresh_token', body: Record<string, string>): Promise<AuthResult<SessionData>> => {
    try {
        const { data } = await axios.post<GoTrueSession>(`${resolveAuthUrl()}/token`, body, {
            params: { grant_type: grantType },
            timeout: resolveAuthTimeout(),
        });
        return { ok: true, data: toSessionData(data) };
    } catch (error) {
        return { ok: false, reason: classifyError(error, `token/${grantType}`) };
    }
};

export const login = (email: string, password: string) => requestToken('password', { email, password });

export const refresh = (refreshToken: string) => requestToken('refresh_token', { refresh_token: refreshToken });

/**
 * Revoga a sessão atual (refresh token) no GoTrue. O access token em si
 * segue válido até expirar — a API valida JWT localmente.
 */
export const logout = async (accessToken: string): Promise<AuthResult<null>> => {
    try {
        await axios.post(`${resolveAuthUrl()}/logout`, {}, {
            params: { scope: 'local' },
            timeout: resolveAuthTimeout(),
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return { ok: true, data: null };
    } catch (error) {
        return { ok: false, reason: classifyError(error, 'logout') };
    }
};

// -----------------------------------------------------------------------------
// API admin do GoTrue — criação de conta
// -----------------------------------------------------------------------------

// As rotas /admin/* do GoTrue exigem um JWT com role pertencente a
// GOTRUE_JWT_ADMIN_ROLES (service_role no compose do nova-auth). Gerado
// sob demanda, com vida curta, só para a chamada em curso — nunca sai
// deste processo.
const signServiceRoleToken = (): string => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
        sub: 'nova-api',
        role: 'service_role',
        aud: 'authenticated',
        iat: now,
        exp: now + 60,
    })}`;
    const signature = createHmac('sha256', process.env.AUTH_JWT_SECRET ?? '').update(unsigned).digest('base64url');
    return `${unsigned}.${signature}`;
};

const adminHeaders = () => ({ Authorization: `Bearer ${signServiceRoleToken()}` });

export type CreateUserFailure = 'email-taken' | 'rejected' | 'unavailable';

export const createUser = async (input: { email: string; password: string; role: AppRole | null }): Promise<
    { ok: true; data: AuthUser } | { ok: false; reason: CreateUserFailure; detail?: string }
> => {
    try {
        const { data } = await axios.post<{ id: string; email?: string | null; app_metadata?: Record<string, unknown> }>(
            `${resolveAuthUrl()}/admin/users`,
            {
                email: input.email,
                password: input.password,
                // Sem SMTP ainda: conta entra confirmada (mesma política de
                // GOTRUE_MAILER_AUTOCONFIRM no nova-auth).
                email_confirm: true,
                // app_metadata só é editável pela API admin — o usuário não
                // consegue promover o próprio papel.
                // Sem papel = conta comum. Papel de equipe (porteiro, sindico,
                // admin) só por síndico/admin; morador vem do vínculo com o Firebird.
                app_metadata: input.role ? { role: input.role } : {},
            },
            { timeout: resolveAuthTimeout(), headers: adminHeaders() },
        );
        return { ok: true, data: { id: data.id, email: data.email ?? null, role: toAppRole(data.app_metadata?.role) } };
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            const status = error.response.status;
            const body = error.response.data as { msg?: string; error_code?: string } | undefined;
            if (status === 422 && body?.error_code === 'email_exists') return { ok: false, reason: 'email-taken' };
            // 4xx restante = política do GoTrue (ex.: senha fraca). A mensagem
            // dele é segura para o admin que está criando a conta.
            if (status >= 400 && status < 500) return { ok: false, reason: 'rejected', detail: body?.msg };
            logger.error(`[ApiV3] Supabase Auth respondeu ${status} ao criar usuário.`);
            return { ok: false, reason: 'unavailable' };
        }
        const message = error instanceof Error ? error.message : 'erro desconhecido';
        logger.error(`[ApiV3] Falha ao contatar o Supabase Auth ao criar usuário: ${message}`);
        return { ok: false, reason: 'unavailable' };
    }
};

/**
 * Contas do GoTrue, mais recentes primeiro — para o admin achar quem acabou
 * de se cadastrar e vincular ao cadastro do Firebird.
 */
export const listUsers = async (page: number, perPage: number): Promise<AuthResult<(AuthUser & { createdAt: string })[]>> => {
    try {
        const { data } = await axios.get<{ users?: { id: string; email?: string | null; created_at: string; app_metadata?: Record<string, unknown> }[] }>(
            `${resolveAuthUrl()}/admin/users`,
            { params: { page, per_page: perPage }, timeout: resolveAuthTimeout(), headers: adminHeaders() },
        );
        const users = (data.users ?? []).map((user) => ({
            id: user.id,
            email: user.email ?? null,
            role: toAppRole(user.app_metadata?.role),
            createdAt: user.created_at,
        }));
        return { ok: true, data: users };
    } catch (error) {
        return { ok: false, reason: classifyError(error, 'admin/users') };
    }
};
