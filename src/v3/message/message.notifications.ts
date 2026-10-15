import logger from '../../core/utils/logger';
import * as messageRepository from '../../core/repositories/message.repository';
import type { MessageCategory } from '../../core/repositories/message.repository';
import { notifySafely } from '../notification/notification.service';
import type { Lang } from '../shared/i18n';

// =============================================================================
// Push de comunicado novo (decisão de 13/10/2026, que substitui "comunicado
// não gera push"). Um laço de 1 min avisa os comunicados com notify = true
// que ficaram visíveis e ainda não foram avisados — cobre a publicação
// imediata e a agendada (publishedAt futuro) do mesmo jeito. Público: quem lê
// comunicados (equipe e morador com unidade liberada) e não desligou a
// preferência.
// =============================================================================

const TICK_MS = 60_000;
const BODY_PREVIEW_LENGTH = 120;
const MAX_TTL_SECONDS = 3 * 24 * 60 * 60;

const CATEGORY_NAMES: Record<MessageCategory, Record<Lang, string>> = {
    manutencao: { 'pt-BR': 'Manutenção', en: 'Maintenance', es: 'Mantenimiento' },
    comunicado: { 'pt-BR': 'Comunicado', en: 'Announcement', es: 'Comunicado' },
    aviso: { 'pt-BR': 'Aviso', en: 'Notice', es: 'Aviso' },
    urgente: { 'pt-BR': 'Urgente', en: 'Urgent', es: 'Urgente' },
};

const preview = (text: string) => {
    const singleLine = text.replace(/\s+/g, ' ').trim();
    return singleLine.length <= BODY_PREVIEW_LENGTH ? singleLine : `${singleLine.slice(0, BODY_PREVIEW_LENGTH - 1).trimEnd()}…`;
};

const tick = async () => {
    for (const message of await messageRepository.listMessagesPendingNotification()) {
        const untilExpiry = message.expiresAt ? (message.expiresAt.getTime() - Date.now()) / 1000 : MAX_TTL_SECONDS;
        await notifySafely({
            kind: 'message.published',
            dedupeKey: `message.published:${message.id}`,
            audience: { kind: 'staff+residents' },
            preference: 'messages',
            // O texto é do síndico e segue como foi escrito; só o nome da categoria acompanha o idioma.
            text: (lang) => ({
                title: message.title,
                body: `${message.label ?? CATEGORY_NAMES[message.category][lang]}: ${preview(message.body)}`,
            }),
            channel: 'messages',
            priority: message.category === 'urgente' ? 'high' : 'normal',
            ttlSeconds: Math.min(MAX_TTL_SECONDS, untilExpiry),
            collapseKey: `message:${message.id}`,
            target: 'message',
            extra: { messageId: String(message.id), category: message.category },
        });
    }
};

export const startMessageNotifications = (): void => {
    let running = false;
    const run = async () => {
        if (running) return;
        running = true;
        try {
            await tick();
        } catch (error) {
            logger.error('[ApiV3 Push] Falha no laço de avisos de comunicados:', error);
        } finally {
            running = false;
        }
    };
    void run();
    setInterval(() => void run(), TICK_MS).unref();
};
