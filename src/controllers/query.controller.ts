import { Request, Response } from 'express';
import { findPersonByCpf, findVehicleByPlate, findVehicleByTag } from '../repositories/query.repository';

/**
 * Valida CPF usando dígitos verificadores.
 * @param cpf CPF numérico (11 dígitos).
 */
const isValidCpf = (cpf: string): boolean => {
    if (!/^[0-9]{11}$/.test(cpf)) {
        return false;
    }

    if (/^(\d)\1{10}$/.test(cpf)) {
        return false;
    }

    const calcDigit = (base: string, factor: number): number => {
        let total = 0;

        for (let index = 0; index < base.length; index += 1) {
            total += Number(base[index]) * (factor - index);
        }

        const remainder = (total * 10) % 11;
        return remainder === 10 ? 0 : remainder;
    };

    const firstDigit = calcDigit(cpf.slice(0, 9), 10);
    const secondDigit = calcDigit(cpf.slice(0, 10), 11);

    return firstDigit === Number(cpf[9]) && secondDigit === Number(cpf[10]);
};

type VehicleQueryRow = Awaited<ReturnType<typeof findVehicleByPlate>>[number];

/**
 * Monta o payload da consulta de veículo a partir das linhas retornadas.
 * @param rows Linhas retornadas pelo banco.
 */
const buildVehiclePayload = (rows: VehicleQueryRow[]) => {
    const firstRow = rows[0];

    if (!firstRow) {
        return {
            vehicle: null,
            unit: null,
            owner: null,
            accesses: [],
        };
    }

    const vehicle = {
        sequencia: firstRow.V_SEQUENCIA,
        placa: firstRow.V_PLACA,
        marca: firstRow.V_MARCA,
        modelo: firstRow.V_MODELO,
        cor: firstRow.V_COR,
        seqUnidade: firstRow.V_SEQUNIDADE,
        proprietario: firstRow.V_PROPRIETARIO,
        tagVeiculo: firstRow.V_TAGVEICULO,
    };

    const unit = firstRow.U_SEQUENCIA
        ? {
            sequencia: firstRow.U_SEQUENCIA,
            quadra: firstRow.U_QUADRA,
            lote: firstRow.U_LOTE,
            status: firstRow.U_STATUS,
            observacoes: firstRow.U_OBSERVACOES,
            ramal: firstRow.U_RAMAL,
            bloquear: firstRow.U_BLOQUEAR,
        }
        : null;

    const owner = firstRow.P_SEQUENCIA
        ? {
            sequencia: firstRow.P_SEQUENCIA,
            pessoaTipo: firstRow.P_PESSOA_TIPO,
            nome: firstRow.P_NOME,
            rg: firstRow.P_RG,
            cpf: firstRow.P_CPF,
            dataNascimento: firstRow.P_DATANASCIMENTO,
            sexo: firstRow.P_SEXO,
            estado: firstRow.P_ESTADO,
            email: firstRow.P_EMAIL,
            telCelular: firstRow.P_TELCELULAR,
            profissao: firstRow.P_PROFISSAO,
            tipo: firstRow.P_TIPO,
            categoria: firstRow.P_CATEGORIA,
            classificacao: firstRow.P_CLASSIFICACAO,
            empresa: firstRow.P_EMPRESA,
            funcao: firstRow.P_FUNCAO,
            observacoes: firstRow.P_OBSERVACOES,
            alertaPortaria: firstRow.P_ALERTAPORTARIA,
            prop: firstRow.P_PROP,
            propTit: firstRow.P_PROPTIT,
            loc: firstRow.P_LOC,
            locTit: firstRow.P_LOCTIT,
            mor: firstRow.P_MOR,
            resp: firstRow.P_RESP,
            familiar: firstRow.P_FAMILIAR,
        }
        : null;

    const accessMap = new Map<string, {
        sequencia: number;
        seqPessoa: number | null;
        tipo: string | null;
        panico: string | null;
        id: string | null;
        id2: string | null;
        veiculo: number | null;
        acessoLiberado: string | null;
    }>();

    for (const row of rows) {
        if (row.I_SEQUENCIA === null || row.I_SEQUENCIA === undefined) {
            continue;
        }

        const key = String(row.I_SEQUENCIA);
        if (accessMap.has(key)) {
            continue;
        }

        accessMap.set(key, {
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
        vehicle,
        unit,
        owner,
        accesses: Array.from(accessMap.values()),
    };
};

/**
 * Consulta CPF e valida existência no banco.
 * @param req Requisição HTTP (params.cpf).
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const queryCpf = async (req: Request, res: Response): Promise<void> => {
    const rawCpf = req.params.cpf ? String(req.params.cpf).trim() : '';
    const normalizedCpf = rawCpf.replace(/\D/g, '');

    if (!normalizedCpf) {
        res.fail('CPF é obrigatório.', 400);
        return;
    }

    if (!isValidCpf(normalizedCpf)) {
        res.fail('CPF inválido.', 400);
        return;
    }

    try {
        const result = await findPersonByCpf(normalizedCpf);
        const personRow = result[0] ?? null;
        const person = personRow
            ? {
                sequencia: personRow.P_SEQUENCIA,
                pessoaTipo: personRow.P_PESSOA_TIPO,
                nome: personRow.P_NOME,
                rg: personRow.P_RG,
                cpf: personRow.P_CPF,
                dataNascimento: personRow.P_DATANASCIMENTO,
                sexo: personRow.P_SEXO,
                email: personRow.P_EMAIL,
                telCelular: personRow.P_TELCELULAR,
                foto: personRow.P_FOTO,
                profissao: personRow.P_PROFISSAO,
                tipo: personRow.P_TIPO,
                categoria: personRow.P_CATEGORIA,
                classificacao: personRow.P_CLASSIFICACAO,
                empresa: personRow.P_EMPRESA,
                funcao: personRow.P_FUNCAO,
                observacoes: personRow.P_OBSERVACOES,
                alertaPortaria: personRow.P_ALERTAPORTARIA,
                prop: personRow.P_PROP,
                propTit: personRow.P_PROPTIT,
                loc: personRow.P_LOC,
                locTit: personRow.P_LOCTIT,
                mor: personRow.P_MOR,
                resp: personRow.P_RESP,
                familiar: personRow.P_FAMILIAR,
            }
            : null;
        const links = personRow
            ? result
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
                    unidade: {
                        sequencia: row.U_SEQUENCIA,
                        quadra: row.U_QUADRA,
                        lote: row.U_LOTE,
                        status: row.U_STATUS,
                        observacoes: row.U_OBSERVACOES,
                        ramal: row.U_RAMAL,
                        bloquear: row.U_BLOQUEAR,
                    },
                }))
            : [];
        res.ok({
            cpf: normalizedCpf,
            isValid: true,
            exists: Boolean(person),
            person,
            links,
        });
    } catch (error: any) {
        console.error('[QueryController] Erro ao consultar CPF:', error?.message ?? error);
        res.fail('Erro ao consultar CPF', error?.status || 500, error?.message ?? error);
    }
};

/**
 * Consulta veículo pela placa.
 * @param req Requisição HTTP (params.plate).
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const queryPlate = async (req: Request, res: Response): Promise<void> => {
    const rawPlate = req.params.plate ? String(req.params.plate).trim() : '';
    const normalizedPlate = rawPlate.toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (!normalizedPlate) {
        res.fail('Placa é obrigatória.', 400);
        return;
    }

    if (normalizedPlate.length !== 7) {
        res.fail('Placa inválida.', 400);
        return;
    }

    try {
        const result = await findVehicleByPlate(normalizedPlate);
        const payload = buildVehiclePayload(result);
        res.ok({
            plate: normalizedPlate,
            exists: Boolean(payload.vehicle),
            ...payload,
        });
    } catch (error: any) {
        console.error('[QueryController] Erro ao consultar placa:', error?.message ?? error);
        res.fail('Erro ao consultar placa', error?.status || 500, error?.message ?? error);
    }
};

/**
 * Consulta veículo pela tag (10 dígitos).
 * @param req Requisição HTTP (params.tag).
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const queryTag = async (req: Request, res: Response): Promise<void> => {
    const rawTag = req.params.tag ? String(req.params.tag).trim() : '';
    const normalizedTag = rawTag.replace(/\D/g, '');

    if (!normalizedTag) {
        res.fail('Tag é obrigatória.', 400);
        return;
    }

    if (!/^[0-9]{10}$/.test(normalizedTag)) {
        res.fail('Tag inválida. Informe 10 dígitos.', 400);
        return;
    }

    try {
        const result = await findVehicleByTag(normalizedTag);
        const payload = buildVehiclePayload(result);
        res.ok({
            tag: normalizedTag,
            exists: Boolean(payload.vehicle),
            ...payload,
        });
    } catch (error: any) {
        console.error('[QueryController] Erro ao consultar tag:', error?.message ?? error);
        res.fail('Erro ao consultar tag', error?.status || 500, error?.message ?? error);
    }
};
