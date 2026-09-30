import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import { findPersonByCpf, findVehicleByPlate, findVehicleByTag } from '../../core/repositories/query.repository';
import { isValidCpf, isValidTag, normalizePlate, sanitizeDigits } from '../../core/services/access-credential';
import { successResponseSchema } from '../shared/response';
import { requireAuth, requireRole } from '../shared/require-auth';

// =============================================================================
// Consultas de portaria no cadastro do Freedom (Firebird), equivalentes a
// /v2/api/queries/*. Só equipe: devolvem dados pessoais (CPF, telefone,
// foto) de moradores. Mesmo formato de payload da v2, para o FRONT migrar
// sem reescrever as telas.
// =============================================================================

const staffOnly = [requireAuth, requireRole('porteiro', 'sindico', 'admin')];

// Payload montado a partir de dezenas de colunas do ERP; o formato está
// documentado no openapi.json, aqui só se garante o envelope.
const payloadSchema = successResponseSchema(z.record(z.string(), z.unknown()));

type VehicleQueryRow = Awaited<ReturnType<typeof findVehicleByPlate>>[number];
type PersonRow = Awaited<ReturnType<typeof findPersonByCpf>>[number];

const toOwner = (row: VehicleQueryRow | PersonRow) => ({
    sequencia: row.P_SEQUENCIA,
    pessoaTipo: row.P_PESSOA_TIPO,
    nome: row.P_NOME,
    rg: row.P_RG,
    cpf: row.P_CPF,
    dataNascimento: row.P_DATANASCIMENTO,
    sexo: row.P_SEXO,
    email: row.P_EMAIL,
    telCelular: row.P_TELCELULAR,
    profissao: row.P_PROFISSAO,
    tipo: row.P_TIPO,
    categoria: row.P_CATEGORIA,
    classificacao: row.P_CLASSIFICACAO,
    empresa: row.P_EMPRESA,
    funcao: row.P_FUNCAO,
    observacoes: row.P_OBSERVACOES,
    alertaPortaria: row.P_ALERTAPORTARIA,
    prop: row.P_PROP,
    propTit: row.P_PROPTIT,
    loc: row.P_LOC,
    locTit: row.P_LOCTIT,
    mor: row.P_MOR,
    resp: row.P_RESP,
    familiar: row.P_FAMILIAR,
});

const toUnit = (row: VehicleQueryRow | PersonRow) => ({
    sequencia: row.U_SEQUENCIA,
    quadra: row.U_QUADRA,
    lote: row.U_LOTE,
    status: row.U_STATUS,
    observacoes: row.U_OBSERVACOES,
    ramal: row.U_RAMAL,
    bloquear: row.U_BLOQUEAR,
});

/** Mesmo agrupamento da v2: veículo, unidade e dono da 1ª linha; acessos sem repetição. */
const buildVehiclePayload = (rows: VehicleQueryRow[]) => {
    const first = rows[0];
    if (!first) return { vehicle: null, unit: null, owner: null, accesses: [] };

    const accesses = new Map<string, unknown>();
    for (const row of rows) {
        if (row.I_SEQUENCIA === null || row.I_SEQUENCIA === undefined) continue;
        const key = String(row.I_SEQUENCIA);
        if (accesses.has(key)) continue;
        accesses.set(key, {
            sequencia: row.I_SEQUENCIA,
            seqPessoa: row.I_SEQPESSOA,
            tipo: row.I_TIPO,
            panico: row.I_PANICO,
            id: row.I_ID,
            id2: row.I_ID2,
            veiculo: row.I_VEICULO,
            acessoLiberado: row.ACESSO_LIBERADO,
        });
    }

    return {
        vehicle: {
            sequencia: first.V_SEQUENCIA,
            placa: first.V_PLACA,
            marca: first.V_MARCA,
            modelo: first.V_MODELO,
            cor: first.V_COR,
            seqUnidade: first.V_SEQUNIDADE,
            proprietario: first.V_PROPRIETARIO,
            tagVeiculo: first.V_TAGVEICULO,
        },
        unit: first.U_SEQUENCIA ? toUnit(first) : null,
        owner: first.P_SEQUENCIA ? { ...toOwner(first), estado: first.P_ESTADO } : null,
        accesses: Array.from(accesses.values()),
    };
};

const invalid = (request: FastifyRequest, reply: FastifyReply, path: string, message: string) =>
    reply.fail({ type: 'validation-error', detail: message, instance: request.url, validationErrors: [{ path, message }] });

const firebirdFailure = (request: FastifyRequest, reply: FastifyReply, what: string, error: unknown) => {
    logger.error(`[ApiV3] Falha ao consultar ${what}:`, error);
    return reply.fail({ type: 'upstream-error', detail: `Falha ao consultar ${what}.`, instance: request.url });
};

export async function queryRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get('/queries/cpf/:cpf', {
        onRequest: staffOnly,
        schema: { params: z.object({ cpf: z.string().trim().min(1) }), response: { 200: payloadSchema } },
    }, async (request, reply) => {
        const cpf = sanitizeDigits(request.params.cpf);
        if (!isValidCpf(cpf)) return invalid(request, reply, '/cpf', 'CPF inválido.');

        try {
            const rows = await findPersonByCpf(cpf);
            const first = rows[0] ?? null;
            const person = first
                ? { ...toOwner(first), foto: first.P_FOTO ? first.P_FOTO.toString('base64') : null }
                : null;
            const links = first
                ? rows
                    .filter((row) => row.PV_SEQUENCIA !== null && row.U_SEQUENCIA !== null)
                    .map((row) => ({
                        pessoaVinculo: {
                            sequencia: row.PV_SEQUENCIA,
                            seqPessoa: row.PV_SEQPESSOA,
                            seqUnidade: row.PV_SEQUNIDADE,
                            prop: row.PV_PROP,
                            propTit: row.PV_PROPTIT,
                            loc: row.PV_LOC,
                            locTit: row.PV_LOCTIT,
                            mor: row.PV_MOR,
                            ap: row.PV_AP,
                            permConcederAut: row.PV_PERMCONCEDERAUT,
                            permAutorizarEnt: row.PV_PERMAUTORIZARENT,
                            responsavel: row.PV_RESPONSAVEL,
                            notificacaoAcesso: row.PV_NOTIFICACAO_ACESSO,
                            notificarCirculacao: row.PV_NOTIFICAR_CIRCULACAO,
                            responsavelFinanceiro: row.PV_RESPONSAVEL_FINANCEIRO,
                        },
                        unidade: toUnit(row),
                    }))
                : [];
            return reply.ok({ cpf, isValid: true, exists: Boolean(person), person, links });
        } catch (error) {
            return firebirdFailure(request, reply, 'CPF', error);
        }
    });

    typedApp.get('/queries/plate/:plate', {
        onRequest: staffOnly,
        schema: { params: z.object({ plate: z.string().trim().min(1) }), response: { 200: payloadSchema } },
    }, async (request, reply) => {
        const plate = normalizePlate(request.params.plate);
        if (plate.length !== 7) return invalid(request, reply, '/plate', 'Placa inválida.');

        try {
            const payload = buildVehiclePayload(await findVehicleByPlate(plate));
            return reply.ok({ plate, exists: Boolean(payload.vehicle), ...payload });
        } catch (error) {
            return firebirdFailure(request, reply, 'placa', error);
        }
    });

    typedApp.get('/queries/tag/:tag', {
        onRequest: staffOnly,
        schema: { params: z.object({ tag: z.string().trim().min(1) }), response: { 200: payloadSchema } },
    }, async (request, reply) => {
        const tag = sanitizeDigits(request.params.tag);
        if (!isValidTag(tag)) return invalid(request, reply, '/tag', 'Tag inválida. Informe 10 dígitos.');

        try {
            const payload = buildVehiclePayload(await findVehicleByTag(tag));
            return reply.ok({ tag, exists: Boolean(payload.vehicle), ...payload });
        } catch (error) {
            return firebirdFailure(request, reply, 'tag', error);
        }
    });
}
