import { executeQuery } from '../services/firebird.service';

export type DoorDevice = {
    sequencia: number;
    ip: string;
    subrede: string;
    gateway: string;
    nome: string;
    deviceId: number;
    usuarioApi: string;
    senhaApi: string;
    ativo: string;
    porta: number;
};

export type GateDevice = {
    sequencia: number;
    numeroDispositivo: number;
    ip: string;
    porta: number;
    classificacoes: string;
    nome: string;
    tipoDispositivo: string;
    ativo: string;
};

const normalizeString = (value: unknown): string => {
    if (value === undefined || value === null) {
        return '';
    }

    return String(value).trim();
};

const normalizeNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const mapDoorRow = (row: any): DoorDevice => {
    return {
        sequencia: normalizeNumber(row?.SEQUENCIA),
        ip: normalizeString(row?.IP),
        subrede: normalizeString(row?.SUBREDE),
        gateway: normalizeString(row?.GATEWAY),
        nome: normalizeString(row?.NOME),
        deviceId: normalizeNumber(row?.DEVICEID),
        usuarioApi: normalizeString(row?.USUARIO_API),
        senhaApi: normalizeString(row?.SENHA_API),
        ativo: normalizeString(row?.ATIVO),
        porta: normalizeNumber(row?.PORTA),
    };
};

const mapGateRow = (row: any): GateDevice => {
    return {
        sequencia: normalizeNumber(row?.SEQUENCIA),
        numeroDispositivo: normalizeNumber(row?.NUMDISPOSITIVO),
        ip: normalizeString(row?.IP),
        porta: normalizeNumber(row?.PORTA),
        classificacoes: normalizeString(row?.CLASSIFICACOES),
        nome: normalizeString(row?.NOME),
        tipoDispositivo: normalizeString(row?.TIPODISPOSITIVO),
        ativo: normalizeString(row?.ATIVO),
    };
};

/**
 * Lista portas disponíveis no controle facial.
 * @returns Lista de portas ativas.
 */
export const listAvailableDoors = async (): Promise<DoorDevice[]> => {
    const query = `
SELECT
    fd.SEQUENCIA,
    fd.IP,
    fd.SUBREDE,
    fd.GATEWAY,
    fd."NOME",
    fd.DEVICEID,
    fd.USUARIO_API,
    fd.SENHA_API,
    fd.ATIVO,
    fd.PORTA
FROM FACIAL_DISP fd
WHERE fd."NOME" IS NOT NULL
    AND fd.ATIVO = 'S'
`;
    const result = await executeQuery(query, []);

    if (!Array.isArray(result)) {
        return [];
    }

    return result.map(mapDoorRow);
};

/**
 * Obtém uma porta pelo ID (DEVICEID).
 * @param id ID da porta.
 * @returns Dados da porta ou null.
 */
export const getDoorById = async (id: number): Promise<DoorDevice | null> => {
    const query = `
SELECT
    fd.SEQUENCIA,
    fd.IP,
    fd.SUBREDE,
    fd.GATEWAY,
    fd."NOME",
    fd.DEVICEID,
    fd.USUARIO_API,
    fd.SENHA_API,
    fd.ATIVO,
    fd.PORTA
FROM FACIAL_DISP fd
WHERE fd."NOME" IS NOT NULL
    AND fd.ATIVO = 'S'
    AND fd.DEVICEID = ?
`;
    const result = await executeQuery(query, [id]);

    if (!Array.isArray(result) || result.length === 0) {
        return null;
    }

    return mapDoorRow(result[0]);
};

/**
 * Lista portões disponíveis para controle por TAG.
 * @returns Lista de portões cadastrados com TAG.
 */
export const listAvailableGates = async (): Promise<GateDevice[]> => {
    const query = `
SELECT
    d.SEQUENCIA,
    d.NUMDISPOSITIVO,
    d.IP,
    d.PORTA,
    d.CLASSIFICACOES,
    d."NOME",
    d.TIPODISPOSITIVO,
    d.ATIVO
FROM DISPACESSO d
WHERE d.TIPODISPOSITIVO LIKE '%TAG%'
`;
    const result = await executeQuery(query, []);

    if (!Array.isArray(result)) {
        return [];
    }

    return result.map(mapGateRow);
};

/**
 * Obtém um portão pelo número do dispositivo.
 * @param numeroDispositivo Número do dispositivo.
 * @returns Dados do portão ou null.
 */
export const getGateByNumeroDispositivo = async (numeroDispositivo: number): Promise<GateDevice | null> => {
    const query = `
SELECT
    d.SEQUENCIA,
    d.NUMDISPOSITIVO,
    d.IP,
    d.PORTA,
    d.CLASSIFICACOES,
    d."NOME",
    d.TIPODISPOSITIVO,
    d.ATIVO
FROM DISPACESSO d
WHERE d.TIPODISPOSITIVO LIKE '%TAG%'
    AND d.NUMDISPOSITIVO = ?
    AND d.ATIVO = 'S'
`;
    const result = await executeQuery(query, [numeroDispositivo]);

    if (!Array.isArray(result) || result.length === 0) {
        return null;
    }

    return mapGateRow(result[0]);
};
