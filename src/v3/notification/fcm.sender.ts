import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type Message } from 'firebase-admin/messaging';
import logger from '../../core/utils/logger';

// =============================================================================
// Envio pelo Firebase Cloud Messaging (HTTP v1, via firebase-admin). A
// credencial é uma conta de serviço com papel "Firebase Cloud Messaging API
// Admin", injetada pelo Portainer em FCM_SERVICE_ACCOUNT_JSON (JSON em
// base64). Sem FCM_ENABLED=true ou sem credencial, o envio fica desligado e
// os avisos só são registrados.
//
// Android recebe mensagem só de dados: o app monta a notificação (canal, som,
// destino do toque) e descarta o aviso se não houver sessão no aparelho.
// =============================================================================

const APP_NAME = 'nova-app-push';
// Limite do FCM por chamada de sendEach.
const BATCH_SIZE = 500;
const RETRY_DELAY_MS = 2_000;

// Token que nunca mais vai funcionar: o app foi desinstalado ou o token trocou.
const INVALID_TOKEN_CODES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
]);
// Falha passageira do lado do Google: vale uma nova tentativa.
const TRANSIENT_CODES = new Set([
    'messaging/internal-error',
    'messaging/server-unavailable',
    'messaging/unavailable',
    'messaging/quota-exceeded',
]);

export type AndroidPush = {
    data: Record<string, string>;
    priority: 'high' | 'normal';
    ttlSeconds: number;
    collapseKey: string;
};

export type SendResult = { success: number; failure: number; invalidTokens: string[] };

// Lidas dentro das funções: imports resolvem antes do dotenv.config().
const isEnabled = () => process.env.FCM_ENABLED === 'true';

let initFailed = false;

const resolveApp = (): App | null => {
    if (getApps().some((app) => app.name === APP_NAME)) return getApp(APP_NAME);
    if (initFailed) return null;

    const encoded = (process.env.FCM_SERVICE_ACCOUNT_JSON ?? '').trim();
    if (!encoded) {
        initFailed = true;
        logger.warn('[ApiV3 Push] FCM_SERVICE_ACCOUNT_JSON ausente — push do app desativado.');
        return null;
    }
    try {
        const credential = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
        return initializeApp({ credential: cert(credential), projectId: credential.project_id }, APP_NAME);
    } catch (error) {
        initFailed = true;
        logger.error('[ApiV3 Push] Credencial do FCM inválida — push do app desativado:', error);
        return null;
    }
};

/** O envio está configurado? Usado pela rota de teste para responder 503 claro. */
export const isPushAvailable = (): boolean => isEnabled() && resolveApp() !== null;

/** Primeiros caracteres do token, para log. O token inteiro nunca vai para o log. */
export const tokenHint = (token: string) => `${token.slice(0, 8)}…`;

const toMessage = (token: string, push: AndroidPush): Message => ({
    token,
    data: push.data,
    android: {
        priority: push.priority,
        ttl: push.ttlSeconds * 1000,
        collapseKey: push.collapseKey,
    },
});

const sendBatch = async (app: App, tokens: string[], push: AndroidPush, attempt: number): Promise<SendResult> => {
    const response = await getMessaging(app).sendEach(tokens.map((token) => toMessage(token, push)));
    const result: SendResult = { success: 0, failure: 0, invalidTokens: [] };
    const retry: string[] = [];

    response.responses.forEach((item, index) => {
        const token = tokens[index];
        if (item.success) {
            result.success += 1;
            return;
        }
        const code = item.error?.code ?? 'desconhecido';
        if (INVALID_TOKEN_CODES.has(code)) {
            result.invalidTokens.push(token);
            result.failure += 1;
        } else if (TRANSIENT_CODES.has(code) && attempt === 1) {
            retry.push(token);
        } else {
            result.failure += 1;
            logger.warn(`[ApiV3 Push] Falha ao enviar para ${tokenHint(token)}: ${code}`);
        }
    });

    if (retry.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        const second = await sendBatch(app, retry, push, 2);
        result.success += second.success;
        result.failure += second.failure;
        result.invalidTokens.push(...second.invalidTokens);
    }
    return result;
};

/**
 * Envia a mesma mensagem a vários aparelhos Android. Nunca lança: falha geral
 * (rede, credencial) conta como falha de todos, para o registro do envio.
 */
export const sendAndroid = async (tokens: string[], push: AndroidPush): Promise<SendResult> => {
    const total: SendResult = { success: 0, failure: 0, invalidTokens: [] };
    if (tokens.length === 0) return total;

    const app = isEnabled() ? resolveApp() : null;
    if (!app) {
        total.failure = tokens.length;
        return total;
    }

    for (let start = 0; start < tokens.length; start += BATCH_SIZE) {
        const batch = tokens.slice(start, start + BATCH_SIZE);
        try {
            const result = await sendBatch(app, batch, push, 1);
            total.success += result.success;
            total.failure += result.failure;
            total.invalidTokens.push(...result.invalidTokens);
        } catch (error) {
            total.failure += batch.length;
            logger.error('[ApiV3 Push] Falha ao chamar o FCM:', error);
        }
    }
    return total;
};
