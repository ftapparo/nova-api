import { executeQuery } from '../services/firebird.service';

/**
 * Obtém todos os veículos.
 * @returns Lista de veículos.
 */
export const getAllVehicles = async (): Promise<VehicleListItem[]> => {
    const query = `SELECT SEQUENCIA, PLACA, TAGVEICULO FROM VEICULOS`;
    return await executeQuery(query, []);
};

/**
 * Obtém um veículo específico pelo ID.
 * @param id ID do veículo.
 * @returns Detalhes do veículo.
 */
export const getOneVehicle = async (id: number | string): Promise<VehicleRecord[]> => {
    const query = `SELECT * FROM VEICULOS WHERE SEQUENCIA = ?`;
    return await executeQuery(query, [id]);
};

/**
 * Cadastra um novo veículo.
 * @param vehicleData Dados do veículo a ser cadastrado.
 * @param vehicleData.plate Placa do veículo.
 * @param vehicleData.brand Marca do veículo.
 * @param vehicleData.model Modelo do veículo.
 * @param vehicleData.color Cor do veículo.
 * @param vehicleData.user_seq Sequência do proprietário.
 * @param vehicleData.unit_seq Sequência da unidade.
 * @param vehicleData.tag Tag do veículo.
 * @returns Resultado da operação de cadastro.
 */
export const registerVehicle = async (
    vehicleData: RegisterVehicleInput
): Promise<{ SEQUENCIA: number }[]> => {
    const { plate, brand, model, color, user_seq, unit_seq, tag } = vehicleData;

    const query = `
        INSERT INTO VEICULOS (PLACA, MARCA, MODELO, COR, PROPRIETARIO, SEQUNIDADE, TAGVEICULO)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING SEQUENCIA;
    `;

    return await executeQuery(query, [plate, brand, model, color, user_seq, unit_seq, tag]);
};

/**
 * Cadastra as fotos do veículo.
 * @param accessData Dados da foto do veículo.
 * @param accessData.vehicleSequence Sequência do veículo.
 * @param accessData.photoTag Foto da tag (opcional).
 * @param accessData.photoVehicle Foto do veículo (opcional).
 * @returns Resultado da operação de cadastro.
 */
export const registerVehiclePhoto = async (
    accessData: RegisterVehiclePhotoInput
): Promise<unknown> => {
    const { vehicleSequence, photoTag, photoVehicle } = accessData;

    const query = `INSERT INTO VEICULOSFOTO (SEQVEICULO, FOTOTAG, FOTO)  VALUES ( ?, ?, ?)`;

    return await executeQuery(query, [vehicleSequence, photoTag, photoVehicle]);
};

/**
 * Cadastra o acesso do veículo.
 * @param accessData Dados do acesso do veículo.
 * @param accessData.personSequence Sequência da pessoa.
 * @param accessData.type Tipo de acesso.
 * @param accessData.useType Tipo de uso.
 * @param accessData.panic Indicador de pânico.
 * @param accessData.id2 Identificador secundário.
 * @param accessData.user Usuário responsável.
 * @param accessData.vehicleSequence Sequência do veículo.
 * @returns Resultado da operação de cadastro.
 */
export const registerVehicleAccess = async (
    accessData: RegisterVehicleAccessInput
): Promise<unknown> => {
    const { personSequence, type, panic, id2, useType, user, vehicleSequence } = accessData;

    const query = `INSERT INTO IDACESSO (SEQPESSOA, TIPO, PANICO, ID2, TIPOUSO, USR, VEICULO) VALUES ( ?, ?, ?, ?, ?, ?, ?)`;

    return await executeQuery(query, [personSequence, type, panic, id2, useType, user, vehicleSequence]);
};

/**
 * Bloqueia o acesso do veículo.
 * @param id Sequência do veículo.
 * @returns Resultado da atualização.
 */
export const setLockVehicle = async (id: number | string): Promise<unknown> => {
    const query = `UPDATE IDACESSO SET TIPOUSO = 'B' WHERE VEICULO = ?`;
    return await executeQuery(query, [Number(id)]);
};

/**
 * Desbloqueia o acesso do veículo.
 * @param id Sequência do veículo.
 * @returns Resultado da atualização.
 */
export const setUnlockVehicle = async (id: number | string): Promise<unknown> => {
    const query = `UPDATE IDACESSO SET TIPOUSO = 'N' WHERE VEICULO = ?`;
    return await executeQuery(query, [Number(id)]);
};

/**
 * Bloqueia veículos sem uso de TAG nos últimos X dias.
 * @param period Quantidade de dias para o período de verificação.
 * @returns Lista de acessos atualizados.
 */
export const setLockVehicleByData = async (period: number | string): Promise<LockVehicleResultItem[]> => {
    const days = Number(period);

    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setDate(now.getDate() - days);

    const formattedDate = pastDate.toISOString().slice(0, 19).replace('T', ' ');

    // 1. Buscar todos os IDACESSO (com SEQUENCIA, ID2 e SEQPESSOA)
    const allAccessesQuery = `
        SELECT SEQUENCIA, ID2, SEQPESSOA
        FROM IDACESSO
        WHERE SEQUENCIA IS NOT NULL
    `;
    const allAccessesResult = await executeQuery(allAccessesQuery, []);

    // 2. Buscar os SEQIDACESSO com TAG nos últimos X dias
    const recentAccessesQuery = `
        SELECT DISTINCT c.SEQIDACESSO
        FROM CIRCULACAODISP c
        WHERE c.FORMAACESSO = 'TAG'
          AND c.DATAHORA >= ?
          AND c.SEQIDACESSO IS NOT NULL
    `;
    const recentAccessesResult = await executeQuery(recentAccessesQuery, [formattedDate]);
    const recentIds = recentAccessesResult.map((row: any) => row.SEQIDACESSO);

    // 3. Filtrar os acessos que NÃO passaram com TAG
    const inactiveAccesses = allAccessesResult.filter(
        (row: any) => !recentIds.includes(row.SEQUENCIA)
    );

    // 4. Extrair os SEQPESSOA únicos
    const seqPessoasInativas = [...new Set(inactiveAccesses.map((a: any) => a.SEQPESSOA))];

    if (seqPessoasInativas.length === 0) {
        return [];
    }

    // 5. Buscar nomes das pessoas filtradas
    const placeholders = seqPessoasInativas.map(() => '?').join(', ');
    const pessoasQuery = `
        SELECT SEQUENCIA, NOME
        FROM PESSOAS
        WHERE SEQUENCIA IN (${placeholders})
    `;
    const pessoasResult = await executeQuery(pessoasQuery, seqPessoasInativas);

    // 6. Montar lista final
    const result: LockVehicleResultItem[] = inactiveAccesses.map((access: any) => {
        const pessoa = pessoasResult.find((p: any) => p.SEQUENCIA === access.SEQPESSOA);
        return {
            SEQUENCIA: access.SEQUENCIA,
            TAG: access.ID2,
            SEQPESSOA: access.SEQPESSOA,
            NOME: pessoa ? pessoa.NOME : 'NÃO ENCONTRADO'
        };
    });

    // 7. Atualizar cada IDACESSO adicionando B na TAG
    for (const item of result) {
        const newTag = `${String(item.TAG ?? '').trim()}B`;

        const updateQuery = `
            UPDATE IDACESSO
            SET ID2 = ?
            WHERE SEQUENCIA = ?
        `;
        await executeQuery(updateQuery, [newTag, item.SEQUENCIA]);
    }

    return result;
};

type VehicleListItem = {
    SEQUENCIA: number;
    PLACA: string;
    TAGVEICULO: string | null;
};

type VehicleRecord = Record<string, unknown>;

type RegisterVehicleInput = {
    plate: string;
    brand: string;
    model: string;
    color: string;
    user_seq: string;
    unit_seq: string;
    tag: string;
};

type RegisterVehiclePhotoInput = {
    vehicleSequence: number;
    photoTag?: Buffer;
    photoVehicle?: Buffer;
};

type RegisterVehicleAccessInput = {
    personSequence: number;
    type: string;
    useType: string;
    panic: string;
    id2: string;
    user: string;
    vehicleSequence: string;
};

type LockVehicleResultItem = {
    SEQUENCIA: number;
    TAG: string | null;
    SEQPESSOA: number;
    NOME: string;
};
