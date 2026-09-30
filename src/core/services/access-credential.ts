import { findPersonByCpf, findVehicleByPlate } from '../repositories/query.repository';

// =============================================================================
// Identificadores de acesso do Freedom: CPF, placa, TAG e ID numérico viram
// a credencial que a procedure ACESSO_DISPOSITIVO_V2 entende ("Y" + 10
// dígitos para TAG, "898" + 8 dígitos + "787" para ID de pessoa).
//
// Cópia da lógica que vive nos controllers da v2 (freedom.controller.ts e
// vehicle-v2.controller.ts). A v2 não pode ser editada, então as cópias de
// lá continuam; quando a v2 sair, esta passa a ser a única.
// =============================================================================

const LEGACY_PLATE_PATTERN = /^[A-Z]{3}[0-9]{4}$/;
const MERCOSUL_PLATE_PATTERN = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
const CPF_DIGITS_REGEX = /^[0-9]{11}$/;
const TAG_DIGITS_REGEX = /^[0-9]{10}$/;
const SHORT_ACCESS_ID_REGEX = /^[0-9]{1,8}$/;
const NORMALIZED_ACCESS_ID_REGEX = /^898[0-9]{8}787$/;
const INVALID_ID_MESSAGE = 'ID deve ser uma placa válida (AAA1234/AAA1A23), CPF válido, TAG com 10 dígitos, ID numérico com até 8 dígitos ou o ID já formatado (898********787).';

/** Erro de resolução com status HTTP sugerido (400 dado inválido, 404 não localizado). */
export class AccessCredentialError extends Error {
    status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.name = 'AccessCredentialError';
        this.status = status;
    }
}

export const sanitizeDigits = (value: string): string => value.replace(/\D/g, '');

export const normalizePlate = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const isPlateFormat = (value: string): boolean =>
    value.length === 7 && (LEGACY_PLATE_PATTERN.test(value) || MERCOSUL_PLATE_PATTERN.test(value));

export const isValidTag = (digits: string): boolean => TAG_DIGITS_REGEX.test(digits);

export const isValidCpf = (cpf: string): boolean => {
    if (!CPF_DIGITS_REGEX.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

    const calcDigit = (base: string, factor: number): number => {
        let total = 0;
        for (let index = 0; index < base.length; index += 1) {
            total += Number(base[index]) * (factor - index);
        }
        const remainder = (total * 10) % 11;
        return remainder === 10 ? 0 : remainder;
    };

    return calcDigit(cpf.slice(0, 9), 10) === Number(cpf[9]) && calcDigit(cpf.slice(0, 10), 11) === Number(cpf[10]);
};

export const buildTagCredential = (tagValue: string): string => {
    const digits = sanitizeDigits(tagValue);
    if (!isValidTag(digits)) throw new AccessCredentialError('Tag inválida. Informe 10 dígitos.');
    return `Y${digits}`;
};

export const buildPersonCredential = (idValue: string): string => {
    const digits = sanitizeDigits(idValue);
    if (!SHORT_ACCESS_ID_REGEX.test(digits)) throw new AccessCredentialError('ID numérico deve conter de 1 a 8 dígitos.');
    return `898${digits.padStart(8, '0')}787`;
};

export const resolveCredentialByCpf = async (cpfDigits: string): Promise<string> => {
    const person = (await findPersonByCpf(cpfDigits))[0];
    if (!person?.P_SEQUENCIA) throw new AccessCredentialError('CPF não localizado na base.', 404);

    const seqPessoa = Number(person.P_SEQUENCIA);
    if (!Number.isFinite(seqPessoa) || seqPessoa <= 0) {
        throw new AccessCredentialError('Sequência da pessoa inválida para geração do ID.');
    }
    return buildPersonCredential(String(seqPessoa));
};

const resolveCredentialByPlate = async (plate: string): Promise<string> => {
    const rows = await findVehicleByPlate(plate);
    if (!Array.isArray(rows) || rows.length === 0) throw new AccessCredentialError('Placa não localizada.', 404);

    const idRow = rows.find((row) => typeof row?.I_ID === 'string' && row.I_ID.trim().length > 0);
    if (idRow?.I_ID) return String(idRow.I_ID).trim();

    const tagValue = rows
        .map((row) => (typeof row?.V_TAGVEICULO === 'string' && row.V_TAGVEICULO.trim().length > 0 ? row.V_TAGVEICULO : row?.I_ID2))
        .find((value) => typeof value === 'string' && value.trim().length > 0);
    if (tagValue) return buildTagCredential(String(tagValue).trim());

    throw new AccessCredentialError('Nenhum ID ou TAG vinculados à placa informada.', 404);
};

/**
 * Converte o identificador digitado (placa, CPF, TAG, ID curto ou ID já
 * formatado) na credencial usada pela procedure de acesso.
 */
export const resolveAccessCredential = async (rawId: string): Promise<string> => {
    const trimmed = rawId.trim();
    if (!trimmed) throw new AccessCredentialError('Informe o identificador para consulta.');

    const plate = normalizePlate(trimmed);
    const digits = sanitizeDigits(trimmed);

    // A ordem importa: 11 dígitos com DV válido é CPF antes de qualquer outra leitura.
    if (isPlateFormat(plate)) return resolveCredentialByPlate(plate);
    if (digits && isValidCpf(digits)) return resolveCredentialByCpf(digits);
    if (isValidTag(digits)) return buildTagCredential(digits);
    if (NORMALIZED_ACCESS_ID_REGEX.test(digits)) return digits;
    if (SHORT_ACCESS_ID_REGEX.test(digits)) return buildPersonCredential(digits);

    throw new AccessCredentialError(INVALID_ID_MESSAGE);
};
