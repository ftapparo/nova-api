import { randomBytes } from 'node:crypto';

// =============================================================================
// Vínculo automático da conta pelo próprio morador (decisão de 15/10/2026):
// CPF e celular informados no app são comparados com PESSOAS.CPF e
// PESSOAS.TELCELULAR do Freedom e descartados — nunca são gravados nem
// registrados em log. Entre a conferência e a confirmação fica só um token
// em memória (conta → pessoa), de uso único e válido por 10 minutos.
//
// Formatos do TELCELULAR levantados em 15/10/2026 (1.070 pessoas com
// unidade): só dígitos; quase todos DDD + 9 dígitos, alguns DDD + 8
// (anteriores ao nono dígito), alguns sem DDD, um com 55 na frente e dois
// estrangeiros com o DDI (351).
// =============================================================================

const onlyDigits = (value: string) => value.replace(/\D/g, '');

/** O celular digitado (DDI + número) corresponde ao do cadastro? */
export const phoneMatches = (storedRaw: string, ddiRaw: string, numberRaw: string): boolean => {
    const stored = onlyDigits(storedRaw);
    const ddi = onlyDigits(ddiRaw);
    const number = onlyDigits(numberRaw);
    if (!stored || !ddi || !number) return false;

    if (ddi !== '55') {
        // Estrangeiro: cadastro com o DDI (com ou sem 00) ou só com o número.
        return stored === ddi + number || stored === `00${ddi}${number}` || stored === number;
    }

    if (number.length !== 10 && number.length !== 11) return false;
    const national = stored.length >= 12 && stored.startsWith('55') ? stored.slice(2) : stored;
    const ddd = number.slice(0, 2);
    const local = number.slice(2);
    // O mesmo celular com e sem o nono dígito (cadastro antigo ou digitação antiga).
    const locals = new Set([local]);
    if (local.length === 9 && local.startsWith('9')) locals.add(local.slice(1));
    if (local.length === 8) locals.add(`9${local}`);

    if (national.length >= 10) {
        return national.slice(0, 2) === ddd && locals.has(national.slice(2));
    }
    // Cadastro sem DDD: compara só o número local.
    return locals.has(national);
};

const CONFIRMATION_TTL_MS = 10 * 60_000;
const confirmations = new Map<string, { accountId: string; personSeq: number; expiresAt: number }>();

export const createConfirmation = (accountId: string, personSeq: number): string => {
    const now = Date.now();
    for (const [token, entry] of confirmations) if (entry.expiresAt <= now) confirmations.delete(token);
    const token = randomBytes(24).toString('base64url');
    confirmations.set(token, { accountId, personSeq, expiresAt: now + CONFIRMATION_TTL_MS });
    return token;
};

/** Pessoa conferida por esta conta, consumindo o token (uso único). */
export const takeConfirmation = (accountId: string, token: string): number | null => {
    const entry = confirmations.get(token);
    if (!entry || entry.accountId !== accountId) return null;
    confirmations.delete(token);
    return entry.expiresAt > Date.now() ? entry.personSeq : null;
};
