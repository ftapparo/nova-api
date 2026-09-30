import { verifyAccessById } from '../../core/repositories/access.repository';
import { getVehicleByPlate, linkVehicleTag } from '../../core/repositories/vehicle-v2.repository';
import { lookupVehicleExternalSources, type ProviderName } from '../../core/services/vehicle-lookup.service';
import { resolveCredentialByCpf } from '../../core/services/access-credential';
import type { Actor } from '../shared/require-auth';

// =============================================================================
// Regras de veículo que na v2 vivem dentro do controller
// (v2/controllers/vehicle-v2.controller.ts) — copiadas, porque a v2 não
// pode ser editada. Cada função devolve um resultado tipado; a rota só
// traduz para o envelope.
// =============================================================================

type VerifyAccessRow = { PERMITIDO?: string | null; PROP?: string | null; LOC?: string | null; MOR?: string | null; SEQPESSOA?: unknown };

const isYes = (value: unknown) => String(value ?? '').trim().toUpperCase() === 'S';

// Quem autoriza a TAG precisa estar liberado no portão e ser proprietário,
// locatário ou morador (mesma regra da v2).
const hasVehiclePermission = (row: VerifyAccessRow | null): boolean =>
    !!row && isYes(row.PERMITIDO) && [row.PROP, row.LOC, row.MOR].some(isYes);

// IDACESSO.USR é o "usuário" gravado pelo ERP; a v2 grava o nome curto do
// login do painel (ex.: PORTARIA). Aqui vai a parte local do e-mail,
// curta, para caber na coluna.
const toErpUser = (actor: Actor): string =>
    (actor.email?.split('@')[0] ?? actor.id).toUpperCase().slice(0, 10) || 'APIV3';

export type LinkTagOutcome =
    | { kind: 'ok'; status: 'linked' | 'swapped'; vehicleSeq: number; tag: string }
    | { kind: 'forbidden' }
    | { kind: 'owner-unknown' }
    | { kind: 'tag-in-use' }
    | { kind: 'needs-confirmation'; currentTag: string | null };

export const linkTag = async (input: {
    vehicleSeq: number;
    cpf: string;
    tag: string;
    numeroDispositivo: number;
    forceSwap: boolean;
    actor: Actor;
}): Promise<LinkTagOutcome> => {
    const credential = await resolveCredentialByCpf(input.cpf);
    const rows = await verifyAccessById(credential, input.numeroDispositivo, null, 'E');
    const row: VerifyAccessRow | null = Array.isArray(rows) ? rows[0] ?? null : null;
    if (!hasVehiclePermission(row)) return { kind: 'forbidden' };

    const ownerSeq = Number(row?.SEQPESSOA);
    if (!Number.isFinite(ownerSeq) || ownerSeq <= 0) return { kind: 'owner-unknown' };

    const result = await linkVehicleTag({
        vehicleSeq: input.vehicleSeq,
        ownerSeq,
        tag: input.tag,
        user: toErpUser(input.actor),
        forceSwap: input.forceSwap,
    });
    if (result.blocked) return { kind: 'tag-in-use' };
    if (result.requiresConfirmation) return { kind: 'needs-confirmation', currentTag: result.currentTag ?? null };
    return { kind: 'ok', status: result.status, vehicleSeq: result.vehicleSeq, tag: result.tag };
};

export type LookupOutcome =
    | { kind: 'ok'; data: unknown }
    | { kind: 'already-linked'; detail: string };

/**
 * Busca marca/modelo/cor da placa. Veículo já vinculado a alguém é recusado
 * (evita cadastrar duplicado); veículo local sem dono responde com o dado
 * local, sem consultar fora.
 */
export const lookupPlate = async (plate: string, provider: ProviderName | null): Promise<LookupOutcome> => {
    const local = await getVehicleByPlate(plate);
    if (local) {
        const ownerSeq = Number(local.PROPRIETARIO ?? 0);
        const unitSeq = Number(local.SEQUNIDADE ?? 0);
        if (ownerSeq > 0 || unitSeq > 0) {
            const ownerName = String(local.OWNERNOME ?? '').trim() || `SEQ ${ownerSeq}`;
            const ownerCpf = String(local.OWNERCPF ?? '').trim() || 'não informado';
            const unit = String(local.UNIDADELOTE ?? '').trim() || String(unitSeq || 'não informada');
            const block = String(local.UNIDADEQUADRA ?? '').trim() || 'não informado';
            return { kind: 'already-linked', detail: `Veículo já vinculado a ${ownerName}, CPF ${ownerCpf}, unidade ${unit}, bloco ${block}.` };
        }

        const fields = { brand: local.MARCA ?? null, model: local.MODELO ?? null, color: local.COR ?? null };
        return {
            kind: 'ok',
            data: {
                plate,
                sources: [{ name: 'LOCAL', success: true, durationMs: 0, message: 'Veículo encontrado na base local.', data: fields }],
                consolidated: {
                    ...fields,
                    sourceUsedByField: {
                        brand: fields.brand ? 'LOCAL' : null,
                        model: fields.model ? 'LOCAL' : null,
                        color: fields.color ? 'LOCAL' : null,
                    },
                },
                overallSuccess: Boolean(fields.brand || fields.model || fields.color),
            },
        };
    }

    return { kind: 'ok', data: await lookupVehicleExternalSources(plate, provider ? [provider] : undefined) };
};
