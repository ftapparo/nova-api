// src/repositories/freedomAccessRepository.ts
import { executeQuery } from '../services/firebirdService';

// Função listar os veiculos cadastrados
export const getAllVehicle = async (): Promise<any> => {
    const query = `SELECT SEQUENCIA, PLACA, TAGVEICULO FROM VEICULOS`;
    return await executeQuery(query, []);
};

// Função para cadastrar veículo
export const getOneVehicle = async (id: number | string): Promise<any> => {
    const query = `SELECT * FROM VEICULOS WHERE SEQUENCIA = ?`;
    return await executeQuery(query, [id]);
};

// Função para cadastrar veículo
export const registerVehicle = async (vehicleData: {
    plate: string;
    brand: string;
    model: string;
    color: string;
    user_seq: string;
    unit_seq: string;
    tag: string
}): Promise<any> => {
    const { plate, brand, model, color, user_seq, unit_seq, tag } = vehicleData;

    const query = `
        INSERT INTO VEICULOS (PLACA, MARCA, MODELO, COR, PROPRIETARIO, SEQUNIDADE, TAGVEICULO)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING SEQUENCIA;
    `;

    return await executeQuery(query, [plate, brand, model, color, user_seq, unit_seq, tag]);
};

// Função para cadastrar foto do veiculo
export const registerVehiclePhoto = async (accessData: {
    vehicleSequence: number;
    photoTag?: Buffer;
    photoVehicle?: Buffer;
}): Promise<any> => {
    const { vehicleSequence, photoTag, photoVehicle } = accessData;

    const query = `INSERT INTO VEICULOSFOTO (SEQVEICULO, FOTOTAG, FOTO)  VALUES ( ?, ?, ?)`;

    return await executeQuery(query,  [vehicleSequence, photoTag, photoVehicle]);
};

// Função para cadastrar acesso
export const registerVehicleAccess = async (accessData: {
    personSequence: number;
    type: string;
    useType: string;
    panic: string,
    id2: string,
    user: string,
    vehicleSequence: string
}): Promise<any> => {
    const { personSequence, type, panic, id2, useType, user, vehicleSequence } = accessData;

    const query = `INSERT INTO IDACESSO (SEQPESSOA, TIPO, PANICO, ID2, TIPOUSO, USR, VEICULO) VALUES ( ?, ?, ?, ?, ?, ?, ?)`;

    return await executeQuery(query, [personSequence, type, panic, id2, useType, user, vehicleSequence]);
};

// Função para bloquear acesso
export const setLockVehicle = async (id: number | string): Promise<any> => {
    const query = `UPDATE IDACESSO SET TIPOUSO = 'B' WHERE VEICULO = ?`;
    return await executeQuery(query, [Number(id)]);
};

// Função para desbloquear acesso
export const setUnlockVehicle = async (id: number | string): Promise<any> => {
    const query = `UPDATE IDACESSO SET TIPOUSO = 'N' WHERE VEICULO = ?`;
    return await executeQuery(query, [Number(id)]);
};

// Função bloquear por data
export const setLockVehicleByData = async (period: number | string): Promise<any> => {
    const days = Number(period);

    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setDate(now.getDate() - days);

    const formattedDate = pastDate.toISOString().slice(0, 19).replace('T', ' ');
    console.log('Data limite:', formattedDate);

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
        console.log('Nenhum inativo encontrado.');
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
    const result = inactiveAccesses.map((access: any) => {
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
        const newTag = `${String(item.TAG).trim()}B`;

        const updateQuery = `
            UPDATE IDACESSO
            SET ID2 = ?
            WHERE SEQUENCIA = ?
        `;
        await executeQuery(updateQuery, [newTag, item.SEQUENCIA]);
        console.log(`Atualizado: SEQUENCIA ${item.SEQUENCIA} -> TAG ${newTag}`);
    }

    console.log(`Atualização concluída para ${result.length} registros.`);
    return result;
};






    // const successList: number[] = [];
    // const failList: { id: number, error: string }[] = [];

    // for (const element of selectResult) {
    //     const id = Number(element.SEQUENCIA);
    //     try {
    //         const updateQuery = `UPDATE IDACESSO SET TIPOUSO = 'B' WHERE VEICULO = ?`;
    //         await executeQuery(updateQuery, [id]);
    //         successList.push(id);
    //     } catch (err: any) {
    //         console.error(`Erro ao atualizar veículo ${id}:`, err.message);
    //         failList.push({ id, error: err.message });
    //     }
    // }

    // return {
    //     updated: successList,
    //     failed: failList,
    //     totalProcessed: selectResult.length,
    // };