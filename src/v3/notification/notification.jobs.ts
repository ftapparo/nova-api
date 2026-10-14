import logger from '../../core/utils/logger';
import { pruneNotifications } from '../../core/repositories/notification.repository';
import { startCieNotifications } from '../cie/cie.notifications';
import { startExhaustNotifications } from '../exhaust/exhaust.notifications';
import { startMessageNotifications } from '../message/message.notifications';
import { refreshAudiences } from './notification.service';

const AUDIENCE_REFRESH_MS = 30 * 60_000;
const PRUNE_MS = 24 * 60 * 60_000;

/**
 * Sobe os laços do push do app (central, exaustor, comunicados, renovação do
 * público e limpeza). Chamar depois de startExhaustService: o laço do
 * exaustor lê a memória já carregada do core.
 */
export const startNotificationJobs = (): void => {
    startCieNotifications();
    startExhaustNotifications();
    startMessageNotifications();

    setInterval(() => {
        refreshAudiences().catch((error) => logger.error('[ApiV3 Push] Falha ao renovar o público dos aparelhos:', error));
    }, AUDIENCE_REFRESH_MS).unref();

    setInterval(() => {
        pruneNotifications().catch((error) => logger.error('[ApiV3 Push] Falha na limpeza de aparelhos e envios:', error));
    }, PRUNE_MS).unref();

    logger.info('[ApiV3 Push] Avisos do app ativos');
};
