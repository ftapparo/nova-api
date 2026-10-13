import type { FastifyRequest } from 'fastify';
import logger from '../../core/utils/logger';
import * as acceptanceRepository from '../../core/repositories/legal-acceptance.repository';
import { resolveClientIp } from '../auth/auth.rate-limit';
import { findCurrentDocument } from './legal.documents';

// =============================================================================
// Aceite do Termo de Uso. Só o Termo é aceito; a Política é informada.
// A versão aceita é sempre comparada com a vigente no servidor e o hash
// gravado é o do PDF oficial — nada disso vem do cliente.
// =============================================================================

export type TermsStatus = {
    termsVersion: string;
    acceptedVersion: string | null;
    acceptedAt: Date | null;
    mustAcceptTerms: boolean;
};

export const currentTermsVersion = (): string => findCurrentDocument('termo-de-uso').version;

export const getTermsStatus = async (accountId: string): Promise<TermsStatus> => {
    const termsVersion = currentTermsVersion();
    const latest = await acceptanceRepository.findLatestAcceptance(accountId, 'termo-de-uso');
    return {
        termsVersion,
        acceptedVersion: latest?.version ?? null,
        acceptedAt: latest?.acceptedAt ?? null,
        mustAcceptTerms: latest?.version !== termsVersion,
    };
};

/**
 * Para a sessão (login, refresh, troca de senha). Falha do Postgres não pode
 * impedir o login: registra o erro e devolve false — o app pediria um aceite
 * que também falharia, prendendo o usuário numa tela sem saída.
 */
export const mustAcceptTermsSafe = async (accountId: string): Promise<boolean> => {
    try {
        return (await getTermsStatus(accountId)).mustAcceptTerms;
    } catch (error) {
        logger.error('[ApiV3] Falha ao consultar aceite do Termo de Uso:', error);
        return false;
    }
};

/** Grava o aceite da versão vigente. Quem chama garante que `version` é a vigente. */
export const recordTermsAcceptance = async (
    request: FastifyRequest,
    accountId: string,
    channel: acceptanceRepository.AcceptanceChannel,
): Promise<void> => {
    const terms = findCurrentDocument('termo-de-uso');
    const userAgent = request.headers['user-agent'];
    await acceptanceRepository.insertAcceptance({
        accountId,
        document: 'termo-de-uso',
        version: terms.version,
        sha256: terms.sha256,
        channel,
        ip: resolveClientIp(request) || null,
        userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
    });
    logger.info(`[ApiV3] Termo de Uso ${terms.version} aceito por ${accountId} (${channel})`);
};
