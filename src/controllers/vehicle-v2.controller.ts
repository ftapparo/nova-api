import { Request, Response } from 'express';
import { verifyAccessById } from '../repositories/access.repository';
import { findPersonByCpf } from '../repositories/query.repository';
import {
    getVehicleByPlate,
    linkVehicleTag,
    listAccessByVehicle,
    listVehiclesByOwner,
    upsertVehicleByPlate,
} from '../repositories/vehicle-v2.repository';

const PLATE_PATTERN = /^[A-Z0-9]{7}$/;
const CPF_DIGITS_REGEX = /^[0-9]{11}$/;
const TAG_DIGITS_REGEX = /^[0-9]{10}$/;

const sanitizeDigits = (value: string): string => value.replace(/\D/g, '');
const normalizePlate = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

const isValidCpf = (cpf: string): boolean => {
    if (!CPF_DIGITS_REGEX.test(cpf) || /^(\d)\1{10}$/.test(cpf)) {
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

const resolveCredentialByCpf = async (cpfDigits: string): Promise<string> => {
    const personRows = await findPersonByCpf(cpfDigits);
    const person = personRows[0];

    if (!person?.P_SEQUENCIA) {
        throw Object.assign(new Error('CPF nao localizado na base.'), { status: 404 });
    }

    const seqPessoa = Number(person.P_SEQUENCIA);
    if (!Number.isFinite(seqPessoa) || seqPessoa <= 0) {
        throw Object.assign(new Error('Sequencia da pessoa invalida para validacao.'), { status: 400 });
    }

    const padded = String(seqPessoa).padStart(8, '0');
    return `898${padded}787`;
};

type VerifyAccessRow = {
    PERMITIDO?: string | null;
    PROP?: string | null;
    LOC?: string | null;
    MOR?: string | null;
};

const hasVehiclePermission = (row: VerifyAccessRow | null): boolean => {
    if (!row) return false;

    const permitido = String(row.PERMITIDO ?? '').trim().toUpperCase() === 'S';
    const profileAllowed = [row.PROP, row.LOC, row.MOR]
        .some((value) => String(value ?? '').trim().toUpperCase() === 'S');

    return permitido && profileAllowed;
};

export const listVehiclesByOwnerController = async (req: Request, res: Response): Promise<void> => {
    const personSeq = Number(req.params.personSeq);
    if (!Number.isFinite(personSeq) || personSeq <= 0) {
        res.fail('Parametro personSeq invalido.', 400);
        return;
    }

    try {
        const rows = await listVehiclesByOwner(personSeq);
        res.ok(rows);
    } catch (error: any) {
        console.error('[VehicleV2] Erro ao listar veiculos por proprietario:', error?.message ?? error);
        res.fail('Erro ao listar veiculos.', error?.status || 500, error?.message ?? error);
    }
};

export const getVehicleByPlateDetailsController = async (req: Request, res: Response): Promise<void> => {
    const rawPlate = String(req.params.plate ?? '').trim();
    const plate = normalizePlate(rawPlate);

    if (!PLATE_PATTERN.test(plate)) {
        res.fail('Placa invalida.', 400);
        return;
    }

    try {
        const vehicle = await getVehicleByPlate(plate);
        if (!vehicle) {
            res.ok({
                exists: false,
                vehicle: null,
                accessTag: null,
            });
            return;
        }

        const accessRows = await listAccessByVehicle(Number(vehicle.SEQUENCIA));
        res.ok({
            exists: true,
            vehicle,
            accessTag: accessRows[0] ?? null,
        });
    } catch (error: any) {
        console.error('[VehicleV2] Erro ao consultar placa:', error?.message ?? error);
        res.fail('Erro ao consultar placa.', error?.status || 500, error?.message ?? error);
    }
};

export const upsertVehicleByPlateController = async (req: Request, res: Response): Promise<void> => {
    const plate = normalizePlate(String(req.body?.plate ?? '').trim());
    const brand = String(req.body?.brand ?? '').trim() || null;
    const model = String(req.body?.model ?? '').trim() || null;
    const color = String(req.body?.color ?? '').trim() || null;
    const ownerSeq = Number(req.body?.ownerSeq);
    const unitSeqRaw = req.body?.unitSeq;
    const unitSeq = unitSeqRaw === null || unitSeqRaw === undefined || unitSeqRaw === ''
        ? null
        : Number(unitSeqRaw);

    if (!PLATE_PATTERN.test(plate)) {
        res.fail('Placa invalida.', 400);
        return;
    }

    if (!Number.isFinite(ownerSeq) || ownerSeq <= 0) {
        res.fail('ownerSeq invalido.', 400);
        return;
    }

    if (unitSeq !== null && (!Number.isFinite(unitSeq) || unitSeq <= 0)) {
        res.fail('unitSeq invalido.', 400);
        return;
    }

    try {
        const result = await upsertVehicleByPlate({
            plate,
            brand,
            model,
            color,
            ownerSeq,
            unitSeq,
        });
        res.ok(result);
    } catch (error: any) {
        console.error('[VehicleV2] Erro ao criar/atualizar veiculo:', error?.message ?? error);
        res.fail('Erro ao salvar veiculo.', error?.status || 500, error?.message ?? error);
    }
};

export const linkVehicleTagController = async (req: Request, res: Response): Promise<void> => {
    const vehicleSeq = Number(req.params.vehicleSeq);
    const cpfDigits = sanitizeDigits(String(req.body?.cpf ?? '').trim());
    const tagDigits = sanitizeDigits(String(req.body?.tag ?? '').trim());
    const dispositivo = Number(req.body?.dispositivo);
    const forceSwap = Boolean(req.body?.forceSwap);
    const user = String(req.body?.user ?? 'API').trim() || 'API';

    if (!Number.isFinite(vehicleSeq) || vehicleSeq <= 0) {
        res.fail('Parametro vehicleSeq invalido.', 400);
        return;
    }

    if (!isValidCpf(cpfDigits)) {
        res.fail('CPF invalido.', 400);
        return;
    }

    if (!TAG_DIGITS_REGEX.test(tagDigits)) {
        res.fail('Tag invalida. Informe 10 digitos.', 400);
        return;
    }

    if (!Number.isFinite(dispositivo) || dispositivo <= 0) {
        res.fail('Dispositivo invalido.', 400);
        return;
    }

    try {
        const credential = await resolveCredentialByCpf(cpfDigits);
        const verifyRows = await verifyAccessById(credential, dispositivo, null, 'E');
        const verifyRow = Array.isArray(verifyRows) ? verifyRows[0] : null;

        if (!hasVehiclePermission(verifyRow)) {
            res.fail('CPF sem permissao para autorizar tag de veiculo.', 403);
            return;
        }

        const ownerSeq = Number((verifyRow as any)?.SEQPESSOA);
        if (!Number.isFinite(ownerSeq) || ownerSeq <= 0) {
            res.fail('Nao foi possivel identificar o proprietario para vinculo.', 400);
            return;
        }

        const result = await linkVehicleTag({
            vehicleSeq,
            ownerSeq,
            tag: tagDigits,
            user,
            forceSwap,
        });

        if (result.blocked) {
            res.fail('Tag ja vinculada a outro veiculo.', 409);
            return;
        }

        if (result.requiresConfirmation) {
            res.fail('Veiculo ja possui tag vinculada. Confirme para trocar.', 409, {
                requiresConfirmation: true,
                currentTag: result.currentTag ?? null,
            });
            return;
        }

        res.ok({
            status: result.status,
            vehicleSeq: result.vehicleSeq,
            tag: result.tag,
        });
    } catch (error: any) {
        console.error('[VehicleV2] Erro ao vincular tag:', error?.message ?? error);
        res.fail('Erro ao vincular tag.', error?.status || 500, error?.message ?? error);
    }
};
