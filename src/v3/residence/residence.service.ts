import * as residenceRepository from '../../core/repositories/residence.repository';
import type { PersonUnitRecord } from '../../core/repositories/residence.repository';
import type { Residence, ResidenceUnit } from './residence.schema';

// =============================================================================
// Situação residencial da conta: vínculo (Postgres) + ligações com unidades
// (Firebird). O login nunca depende disto — a conta segue autenticando;
// o que muda é o que o app libera.
//
// Regras de acesso por unidade (decisão de 28/09/2026). O cadastro do
// Firebird tem erros herdados e o sistema de controle de acesso aceita
// combinações sem sentido — a regra é estrita de propósito, para forçar a
// correção do cadastro. Titularidade (PROPTIT/LOCTIT) não importa.
// 1. MOR diferente de 'S' → bloqueia.
// 2. Só LOC='S' (sem PROP) → libera.
// 3. Só PROP='S' (sem LOC) → libera, a menos que outra pessoa da unidade
//    tenha LOC='S' (lei do inquilinato: quem vale é o inquilino).
// 4. Qualquer outra combinação (PROP e LOC juntos, ou nenhum) → bloqueia.
// Ligação removida pelo zelador apaga a linha de PESSOASVINC: a unidade
//   simplesmente some da lista.
// =============================================================================

// Cache curto por pessoa: evita consultar o ERP a cada abertura do app, e
// ainda reflete em poucos minutos uma alteração feita pelo zelador direto
// no Firebird (que não avisa a API).
const CACHE_TTL_MS = 2 * 60 * 1000;
const unitsCache = new Map<number, { units: ResidenceUnit[]; nome: string; expiresAt: number }>();

const resolveBlockReason = (record: PersonUnitRecord): ResidenceUnit['blockedReason'] => {
    if (!record.mor) return 'nao-morador';
    if (record.loc && !record.prop) return null;
    if (record.prop && !record.loc) return record.unitHasOtherTenant ? 'unidade-com-inquilino' : null;
    // PROP e LOC juntos, ou nenhum dos dois: o sistema de controle de acesso
    // permite esses cadastros, mas não fazem sentido — bloqueia até a
    // administração corrigir o cadastro no Firebird.
    return 'cadastro-inconsistente';
};

export const toResidenceUnit = (record: PersonUnitRecord): ResidenceUnit => {
    const blockedReason = resolveBlockReason(record);

    return {
        sequencia: record.unitSeq,
        quadra: record.quadra,
        lote: record.lote,
        label: `${record.quadra}-${record.lote}`,
        morador: record.mor,
        proprietario: record.prop,
        locatario: record.loc,
        blocked: blockedReason !== null,
        blockedReason,
    };
};

const loadPerson = async (personSeq: number) => {
    const cached = unitsCache.get(personSeq);
    if (cached && cached.expiresAt > Date.now()) return cached;

    const [person, records] = await Promise.all([
        residenceRepository.findPerson(personSeq),
        residenceRepository.findPersonUnits(personSeq),
    ]);
    const entry = {
        nome: person?.nome ?? '',
        units: records.map(toResidenceUnit),
        expiresAt: Date.now() + CACHE_TTL_MS,
    };
    unitsCache.set(personSeq, entry);
    return entry;
};

export const invalidatePerson = (personSeq: number) => unitsCache.delete(personSeq);

export const getResidence = async (accountId: string): Promise<Residence> => {
    const link = await residenceRepository.findLinkByAccount(accountId);
    if (!link) {
        return { status: 'pendente', blocked: true, person: null, units: [] };
    }

    const { nome, units } = await loadPerson(link.personSeq);
    const hasActiveUnit = units.some((unit) => !unit.blocked);
    return {
        status: units.length > 0 ? 'ativo' : 'sem-unidade',
        blocked: !hasActiveUnit,
        person: { sequencia: link.personSeq, nome },
        units,
    };
};

export type LinkFailure = 'person-not-found' | 'person-already-linked';

export const linkAccount = async (
    accountId: string,
    personSeq: number,
    linkedBy: string,
): Promise<{ ok: true; link: residenceRepository.AccountPersonLink } | { ok: false; reason: LinkFailure }> => {
    const person = await residenceRepository.findPerson(personSeq);
    if (!person) return { ok: false, reason: 'person-not-found' };

    const existing = await residenceRepository.findLinkByPerson(personSeq);
    if (existing && existing.accountId !== accountId) return { ok: false, reason: 'person-already-linked' };

    const previous = await residenceRepository.findLinkByAccount(accountId);
    const link = await residenceRepository.upsertLink(accountId, personSeq, linkedBy);
    if (previous) invalidatePerson(previous.personSeq);
    invalidatePerson(personSeq);
    return { ok: true, link };
};

export const unlinkAccount = async (accountId: string): Promise<boolean> => {
    const previous = await residenceRepository.findLinkByAccount(accountId);
    if (!previous) return false;
    await residenceRepository.deleteLink(accountId);
    invalidatePerson(previous.personSeq);
    return true;
};

export const listLinks = () => residenceRepository.listLinks();
