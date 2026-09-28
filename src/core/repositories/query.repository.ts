import { executeQuery } from '../services/firebird.service';

/**
 * Consulta pessoa por CPF.
 * @param cpf CPF normalizado (somente números).
 * @returns Lista com a pessoa encontrada (se houver).
 */
export const findPersonByCpf = async (cpf: string): Promise<PersonCpfRecord[]> => {
    const query = `
        SELECT
          p.SEQUENCIA AS P_SEQUENCIA,
          p.PESSOA_TIPO AS P_PESSOA_TIPO,
          p.NOME AS P_NOME,
          p.RG AS P_RG,
          p.CPF AS P_CPF,
          p.DATANASCIMENTO AS P_DATANASCIMENTO,
          p.SEXO AS P_SEXO,
          p.EMAIL AS P_EMAIL,
          p.TELCELULAR AS P_TELCELULAR,
          p.FOTO AS P_FOTO,
          p.PROFISSAO AS P_PROFISSAO,
          p.TIPO AS P_TIPO,
          p.CATEGORIA AS P_CATEGORIA,
          p.CLASSIFICACAO AS P_CLASSIFICACAO,
          p.EMPRESA AS P_EMPRESA,
          p.FUNCAO AS P_FUNCAO,
          p.OBSERVACOES AS P_OBSERVACOES,
          p.ALERTAPORTARIA AS P_ALERTAPORTARIA,
          p.PROP AS P_PROP,
          p.PROPTIT AS P_PROPTIT,
          p.LOC AS P_LOC,
          p.LOCTIT AS P_LOCTIT,
          p.MOR AS P_MOR,
          p.RESP AS P_RESP,
          p.FAMILIAR AS P_FAMILIAR,
          pv.SEQUENCIA AS PV_SEQUENCIA,
          pv.SEQPESSOA AS PV_SEQPESSOA,
          pv.SEQUNIDADE AS PV_SEQUNIDADE,
          pv.PROP AS PV_PROP,
          pv.PROPTIT AS PV_PROPTIT,
          pv.LOC AS PV_LOC,
          pv.LOCTIT AS PV_LOCTIT,
          pv.MOR AS PV_MOR,
          pv.AP AS PV_AP,
          pv.PERMCONCEDERAUT AS PV_PERMCONCEDERAUT,
          pv.PERMAUTORIZARENT AS PV_PERMAUTORIZARENT,
          pv.RESPONSAVEL AS PV_RESPONSAVEL,
          pv.NOTIFICACAO_ACESSO AS PV_NOTIFICACAO_ACESSO,
          pv.NOTIFICAR_CIRCULACAO AS PV_NOTIFICAR_CIRCULACAO,
          pv.RESPONSAVEL_FINANCEIRO AS PV_RESPONSAVEL_FINANCEIRO,
          u.SEQUENCIA AS U_SEQUENCIA,
          u.QUADRA AS U_QUADRA,
          u.LOTE AS U_LOTE,
          u.STATUS AS U_STATUS,
          u.OBSERVACOES AS U_OBSERVACOES,
          u.RAMAL AS U_RAMAL,
          u.BLOQUEAR AS U_BLOQUEAR
        FROM PESSOAS p
        LEFT JOIN PESSOASVINC pv ON pv.SEQPESSOA = p.SEQUENCIA
        LEFT JOIN UNIDADES u ON u.SEQUENCIA = pv.SEQUNIDADE
        WHERE p."CPF" = ?
    `;

    return await executeQuery(query, [cpf]);
};

/**
 * Consulta veículo pela placa.
 * @param plate Placa normalizada.
 * @returns Lista com o veículo encontrado (se houver).
 */
export const findVehicleByPlate = async (plate: string): Promise<VehicleQueryRecord[]> => {
    const query = `
                SELECT
                    v.SEQUENCIA AS V_SEQUENCIA,
                    v.PLACA AS V_PLACA,
                    v.MARCA AS V_MARCA,
                    v.MODELO AS V_MODELO,
                    v.COR AS V_COR,
                    v.SEQUNIDADE AS V_SEQUNIDADE,
                    v.PROPRIETARIO AS V_PROPRIETARIO,
                    v.TAGVEICULO AS V_TAGVEICULO,
                    u.SEQUENCIA AS U_SEQUENCIA,
                    u.QUADRA AS U_QUADRA,
                    u.LOTE AS U_LOTE,
                    u."STATUS" AS U_STATUS,
                    u.OBSERVACOES AS U_OBSERVACOES,
                    u.RAMAL AS U_RAMAL,
                    u.BLOQUEAR AS U_BLOQUEAR,
                    i.SEQUENCIA AS I_SEQUENCIA,
                    i.SEQPESSOA AS I_SEQPESSOA,
                    i.TIPO AS I_TIPO,
                    i.PANICO AS I_PANICO,
                    i.ID AS I_ID,
                    i.ID2 AS I_ID2,
                    i.VEICULO AS I_VEICULO,
                    p.SEQUENCIA AS P_SEQUENCIA,
                    p.PESSOA_TIPO AS P_PESSOA_TIPO,
                    p.NOME AS P_NOME,
                    p.RG AS P_RG,
                    p.CPF AS P_CPF,
                    p.DATANASCIMENTO AS P_DATANASCIMENTO,
                    p.SEXO AS P_SEXO,
                    p.ESTADO AS P_ESTADO,
                    p.EMAIL AS P_EMAIL,
                    p.TELCELULAR AS P_TELCELULAR,
                    p.PROFISSAO AS P_PROFISSAO,
                    p.TIPO AS P_TIPO,
                    p.CATEGORIA AS P_CATEGORIA,
                    p.CLASSIFICACAO AS P_CLASSIFICACAO,
                    p.EMPRESA AS P_EMPRESA,
                    p.FUNCAO AS P_FUNCAO,
                    p.OBSERVACOES AS P_OBSERVACOES,
                    p.ALERTAPORTARIA AS P_ALERTAPORTARIA,
                    p.PROP AS P_PROP,
                    p.PROPTIT AS P_PROPTIT,
                    p.LOC AS P_LOC,
                    p.LOCTIT AS P_LOCTIT,
                    p.MOR AS P_MOR,
                    p.RESP AS P_RESP,
                    p.FAMILIAR AS P_FAMILIAR,
                    CASE
                        WHEN i.SEQUENCIA IS NOT NULL AND COALESCE(i.PANICO, 'N') = 'N' THEN 'S'
                        ELSE 'N'
                    END AS ACESSO_LIBERADO
                FROM VEICULOS v
                LEFT JOIN UNIDADES u
                    ON u.SEQUENCIA = v.SEQUNIDADE
                LEFT JOIN IDACESSO i
                    ON (TRIM(i.ID) = TRIM(v.TAGVEICULO) OR TRIM(i.ID2) = TRIM(v.TAGVEICULO))
                LEFT JOIN PESSOAS p
                    ON p.SEQUENCIA = v.PROPRIETARIO
                WHERE v.PLACA = ?
    `;

    return await executeQuery(query, [plate]);
};

/**
 * Consulta veículo pela tag (10 dígitos).
 * @param tag Tag normalizada.
 * @returns Lista com o veículo encontrado (se houver).
 */
export const findVehicleByTag = async (tag: string): Promise<VehicleQueryRecord[]> => {
    const query = `
                SELECT
                    v.SEQUENCIA AS V_SEQUENCIA,
                    v.PLACA AS V_PLACA,
                    v.MARCA AS V_MARCA,
                    v.MODELO AS V_MODELO,
                    v.COR AS V_COR,
                    v.SEQUNIDADE AS V_SEQUNIDADE,
                    v.PROPRIETARIO AS V_PROPRIETARIO,
                    v.TAGVEICULO AS V_TAGVEICULO,
                    u.SEQUENCIA AS U_SEQUENCIA,
                    u.QUADRA AS U_QUADRA,
                    u.LOTE AS U_LOTE,
                    u."STATUS" AS U_STATUS,
                    u.OBSERVACOES AS U_OBSERVACOES,
                    u.RAMAL AS U_RAMAL,
                    u.BLOQUEAR AS U_BLOQUEAR,
                    i.SEQUENCIA AS I_SEQUENCIA,
                    i.SEQPESSOA AS I_SEQPESSOA,
                    i.TIPO AS I_TIPO,
                    i.PANICO AS I_PANICO,
                    i.ID AS I_ID,
                    i.ID2 AS I_ID2,
                    i.VEICULO AS I_VEICULO,
                    p.SEQUENCIA AS P_SEQUENCIA,
                    p.PESSOA_TIPO AS P_PESSOA_TIPO,
                    p.NOME AS P_NOME,
                    p.RG AS P_RG,
                    p.CPF AS P_CPF,
                    p.DATANASCIMENTO AS P_DATANASCIMENTO,
                    p.SEXO AS P_SEXO,
                    p.ESTADO AS P_ESTADO,
                    p.EMAIL AS P_EMAIL,
                    p.TELCELULAR AS P_TELCELULAR,
                    p.PROFISSAO AS P_PROFISSAO,
                    p.TIPO AS P_TIPO,
                    p.CATEGORIA AS P_CATEGORIA,
                    p.CLASSIFICACAO AS P_CLASSIFICACAO,
                    p.EMPRESA AS P_EMPRESA,
                    p.FUNCAO AS P_FUNCAO,
                    p.OBSERVACOES AS P_OBSERVACOES,
                    p.ALERTAPORTARIA AS P_ALERTAPORTARIA,
                    p.PROP AS P_PROP,
                    p.PROPTIT AS P_PROPTIT,
                    p.LOC AS P_LOC,
                    p.LOCTIT AS P_LOCTIT,
                    p.MOR AS P_MOR,
                    p.RESP AS P_RESP,
                    p.FAMILIAR AS P_FAMILIAR,
                    CASE
                        WHEN i.SEQUENCIA IS NOT NULL AND COALESCE(i.PANICO, 'N') = 'N' THEN 'S'
                        ELSE 'N'
                    END AS ACESSO_LIBERADO
                FROM VEICULOS v
                LEFT JOIN UNIDADES u
                    ON u.SEQUENCIA = v.SEQUNIDADE
                LEFT JOIN IDACESSO i
                    ON (TRIM(i.ID) = TRIM(v.TAGVEICULO) OR TRIM(i.ID2) = TRIM(v.TAGVEICULO))
                LEFT JOIN PESSOAS p
                    ON p.SEQUENCIA = v.PROPRIETARIO
                WHERE v.TAGVEICULO = ?
    `;

    return await executeQuery(query, [tag]);
};

type PersonCpfRecord = {
    P_SEQUENCIA: number;
    P_PESSOA_TIPO: string | null;
    P_NOME: string | null;
    P_RG: string | null;
    P_CPF: string | null;
    P_DATANASCIMENTO: string | null;
    P_SEXO: string | null;
    P_EMAIL: string | null;
    P_TELCELULAR: string | null;
    P_FOTO: Buffer | null;
    P_PROFISSAO: string | null;
    P_TIPO: string | null;
    P_CATEGORIA: string | null;
    P_CLASSIFICACAO: string | null;
    P_EMPRESA: string | null;
    P_FUNCAO: string | null;
    P_OBSERVACOES: string | null;
    P_ALERTAPORTARIA: string | null;
    P_PROP: string | null;
    P_PROPTIT: string | null;
    P_LOC: string | null;
    P_LOCTIT: string | null;
    P_MOR: string | null;
    P_RESP: string | null;
    P_FAMILIAR: string | null;
    PV_SEQUENCIA: number | null;
    PV_SEQPESSOA: number | null;
    PV_SEQUNIDADE: number | null;
    PV_PROP: string | null;
    PV_PROPTIT: string | null;
    PV_LOC: string | null;
    PV_LOCTIT: string | null;
    PV_MOR: string | null;
    PV_AP: string | null;
    PV_PERMCONCEDERAUT: string | null;
    PV_PERMAUTORIZARENT: string | null;
    PV_RESPONSAVEL: string | null;
    PV_NOTIFICACAO_ACESSO: string | null;
    PV_NOTIFICAR_CIRCULACAO: string | null;
    PV_RESPONSAVEL_FINANCEIRO: string | null;
    U_SEQUENCIA: number | null;
    U_QUADRA: string | null;
    U_LOTE: string | null;
    U_STATUS: string | null;
    U_OBSERVACOES: string | null;
    U_RAMAL: string | null;
    U_BLOQUEAR: string | null;
};

type VehicleQueryRecord = {
    V_SEQUENCIA: number;
    V_PLACA: string | null;
    V_MARCA: string | null;
    V_MODELO: string | null;
    V_COR: string | null;
    V_SEQUNIDADE: number | null;
    V_PROPRIETARIO: number | null;
    V_TAGVEICULO: string | null;
    U_SEQUENCIA: number | null;
    U_QUADRA: string | null;
    U_LOTE: string | null;
    U_STATUS: string | null;
    U_OBSERVACOES: string | null;
    U_RAMAL: string | null;
    U_BLOQUEAR: string | null;
    I_SEQUENCIA: number | null;
    I_SEQPESSOA: number | null;
    I_TIPO: string | null;
    I_PANICO: string | null;
    I_ID: string | null;
    I_ID2: string | null;
    I_VEICULO: number | null;
    P_SEQUENCIA: number | null;
    P_PESSOA_TIPO: string | null;
    P_NOME: string | null;
    P_RG: string | null;
    P_CPF: string | null;
    P_DATANASCIMENTO: string | null;
    P_SEXO: string | null;
    P_ESTADO: string | null;
    P_EMAIL: string | null;
    P_TELCELULAR: string | null;
    P_PROFISSAO: string | null;
    P_TIPO: string | null;
    P_CATEGORIA: string | null;
    P_CLASSIFICACAO: string | null;
    P_EMPRESA: string | null;
    P_FUNCAO: string | null;
    P_OBSERVACOES: string | null;
    P_ALERTAPORTARIA: string | null;
    P_PROP: string | null;
    P_PROPTIT: string | null;
    P_LOC: string | null;
    P_LOCTIT: string | null;
    P_MOR: string | null;
    P_RESP: string | null;
    P_FAMILIAR: string | null;
    ACESSO_LIBERADO: string | null;
};
