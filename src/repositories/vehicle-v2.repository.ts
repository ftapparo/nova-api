import Firebird from 'node-firebird';
import { executeQuery, executeTransaction } from '../services/firebird.service';

export type VehicleRow = {
    SEQUENCIA: number;
    PLACA: string;
    MARCA: string | null;
    MODELO: string | null;
    COR: string | null;
    SEQUNIDADE: number | null;
    PROPRIETARIO: number | null;
    TAGVEICULO: string | null;
};

export type AccessRow = {
    SEQUENCIA: number;
    SEQPESSOA: number | null;
    ID: string | null;
    ID2: string | null;
    TIPO: string | null;
    PANICO: string | null;
    VEICULO: number | null;
    USR: string | null;
    LASTMODIFY: string | null;
    DATAALT: string | null;
    TIPOUSO: string | null;
};

type TxQueryResult<T> = T[] | T | undefined | null;

const txQuery = <T>(tx: Firebird.Transaction, sql: string, params: unknown[]): Promise<TxQueryResult<T>> =>
    new Promise((resolve, reject) => {
        tx.query(sql, params, (err: Error | null, result: TxQueryResult<T>) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    });

const asRows = <T>(value: TxQueryResult<T> | T[]): T[] => {
    if (Array.isArray(value)) {
        return value;
    }

    if (!value) {
        return [];
    }

    return [value];
};

const firstRow = <T>(value: TxQueryResult<T> | T[]): T | null => {
    const rows = asRows(value);
    return rows[0] ?? null;
};

const isUniqueViolation = (error: unknown): boolean => {
    const message = String((error as { message?: string })?.message ?? '').toLowerCase();
    return message.includes('violation of primary') || message.includes('unique key') || message.includes('duplicate');
};

export const listVehiclesByOwner = async (personSeq: number): Promise<VehicleRow[]> => {
    const query = `
        SELECT
            v.SEQUENCIA,
            v.PLACA,
            v.MARCA,
            v.MODELO,
            v.COR,
            v.SEQUNIDADE,
            v.PROPRIETARIO,
            v.TAGVEICULO
        FROM VEICULOS v
        WHERE v.PROPRIETARIO = ?
        ORDER BY v.PLACA
    `;

    return executeQuery(query, [personSeq]);
};

export const getVehicleByPlate = async (plate: string): Promise<VehicleRow | null> => {
    const query = `
        SELECT
            v.SEQUENCIA,
            v.PLACA,
            v.MARCA,
            v.MODELO,
            v.COR,
            v.SEQUNIDADE,
            v.PROPRIETARIO,
            v.TAGVEICULO
        FROM VEICULOS v
        WHERE v.PLACA = ?
    `;

    const rows = await executeQuery(query, [plate]);
    return rows[0] ?? null;
};

export const listAccessByVehicle = async (vehicleSeq: number): Promise<AccessRow[]> => {
    const query = `
        SELECT
            i.SEQUENCIA,
            i.SEQPESSOA,
            i.ID,
            i.ID2,
            i.TIPO,
            i.PANICO,
            i.VEICULO,
            i.USR,
            i.LASTMODIFY,
            i.DATAALT,
            i.TIPOUSO
        FROM IDACESSO i
        WHERE i.VEICULO = ?
        ORDER BY i.SEQUENCIA DESC
    `;

    return executeQuery(query, [vehicleSeq]);
};

export const upsertVehicleByPlate = async (input: {
    plate: string;
    brand: string | null;
    model: string | null;
    color: string | null;
    ownerSeq: number;
    unitSeq: number | null;
}): Promise<{ created: boolean; vehicle: VehicleRow }> => {
    const { plate, brand, model, color, ownerSeq, unitSeq } = input;

    return executeTransaction(async (tx) => {
        const selectSql = `
            SELECT
                v.SEQUENCIA,
                v.PLACA,
                v.MARCA,
                v.MODELO,
                v.COR,
                v.SEQUNIDADE,
                v.PROPRIETARIO,
                v.TAGVEICULO
            FROM VEICULOS v
            WHERE v.PLACA = ?
        `;

        const updateSql = `
            UPDATE VEICULOS
            SET
                MARCA = ?,
                MODELO = ?,
                COR = ?,
                PROPRIETARIO = ?,
                SEQUNIDADE = ?
            WHERE PLACA = ?
        `;

        const existing = firstRow<VehicleRow>(await txQuery<VehicleRow>(tx, selectSql, [plate]));
        if (existing) {
            await txQuery(tx, updateSql, [brand, model, color, ownerSeq, unitSeq, plate]);
            const updated = firstRow<VehicleRow>(await txQuery<VehicleRow>(tx, selectSql, [plate]));
            if (!updated) {
                throw new Error('Falha ao carregar veiculo atualizado.');
            }

            return {
                created: false,
                vehicle: updated,
            };
        }

        const insertSql = `
            INSERT INTO VEICULOS (PLACA, MARCA, MODELO, COR, PROPRIETARIO, SEQUNIDADE)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING SEQUENCIA
        `;

        try {
            await txQuery<{ SEQUENCIA: number }>(tx, insertSql, [plate, brand, model, color, ownerSeq, unitSeq]);
        } catch (error) {
            if (!isUniqueViolation(error)) {
                throw error;
            }

            await txQuery(tx, updateSql, [brand, model, color, ownerSeq, unitSeq, plate]);
            const merged = firstRow<VehicleRow>(await txQuery<VehicleRow>(tx, selectSql, [plate]));
            if (!merged) {
                throw new Error('Falha ao carregar veiculo apos conflito de placa.');
            }

            return {
                created: false,
                vehicle: merged,
            };
        }

        const inserted = firstRow<VehicleRow>(await txQuery<VehicleRow>(tx, selectSql, [plate]));
        if (!inserted) {
            throw new Error('Falha ao carregar veiculo criado.');
        }

        return {
            created: true,
            vehicle: inserted,
        };
    });
};

export const linkVehicleTag = async (input: {
    vehicleSeq: number;
    ownerSeq: number;
    tag: string;
    user: string;
    forceSwap: boolean;
}): Promise<{
    status: 'linked' | 'swapped';
    vehicleSeq: number;
    tag: string;
    requiresConfirmation?: boolean;
    currentTag?: string | null;
    blocked?: boolean;
}> => {
    const { vehicleSeq, ownerSeq, tag, user, forceSwap } = input;

    return executeTransaction(async (tx) => {
        const vehicle = firstRow<VehicleRow>(await txQuery<VehicleRow>(tx, `
            SELECT
                v.SEQUENCIA,
                v.PLACA,
                v.MARCA,
                v.MODELO,
                v.COR,
                v.SEQUNIDADE,
                v.PROPRIETARIO,
                v.TAGVEICULO
            FROM VEICULOS v
            WHERE v.SEQUENCIA = ?
        `, [vehicleSeq]));

        if (!vehicle) {
            throw Object.assign(new Error('Veiculo nao encontrado.'), { status: 404 });
        }

        const vehicleTagConflict = firstRow<{ SEQUENCIA: number }>(await txQuery<{ SEQUENCIA: number }>(tx, `
            SELECT FIRST 1 v.SEQUENCIA
            FROM VEICULOS v
            WHERE TRIM(COALESCE(v.TAGVEICULO, '')) = ?
              AND v.SEQUENCIA <> ?
        `, [tag, vehicleSeq]));

        if (vehicleTagConflict) {
            return {
                status: 'linked' as const,
                vehicleSeq,
                tag,
                blocked: true,
            };
        }

        const accessTagConflict = firstRow<{ SEQUENCIA: number; VEICULO: number }>(await txQuery<{ SEQUENCIA: number; VEICULO: number }>(tx, `
            SELECT FIRST 1 i.SEQUENCIA, i.VEICULO
            FROM IDACESSO i
            WHERE (TRIM(COALESCE(i.ID, '')) = ? OR TRIM(COALESCE(i.ID2, '')) = ?)
              AND COALESCE(i.VEICULO, 0) <> ?
        `, [tag, tag, vehicleSeq]));

        if (accessTagConflict) {
            return {
                status: 'linked' as const,
                vehicleSeq,
                tag,
                blocked: true,
            };
        }

        const accessRows = asRows<AccessRow>(await txQuery<AccessRow>(tx, `
            SELECT
                i.SEQUENCIA,
                i.SEQPESSOA,
                i.ID,
                i.ID2,
                i.TIPO,
                i.PANICO,
                i.VEICULO,
                i.USR,
                i.LASTMODIFY,
                i.DATAALT,
                i.TIPOUSO
            FROM IDACESSO i
            WHERE i.VEICULO = ?
            ORDER BY i.SEQUENCIA DESC
        `, [vehicleSeq]));

        const primaryAccess = accessRows[0] ?? null;
        const currentTag = String(
            primaryAccess?.ID2?.trim()
            || primaryAccess?.ID?.trim()
            || vehicle.TAGVEICULO?.trim()
            || ''
        ).trim();

        if (currentTag && currentTag !== tag && !forceSwap) {
            return {
                status: 'linked' as const,
                vehicleSeq,
                tag,
                requiresConfirmation: true,
                currentTag,
            };
        }

        if (primaryAccess) {
            await txQuery(tx, `
                UPDATE IDACESSO
                SET
                    SEQPESSOA = ?,
                    ID = ?,
                    ID2 = ?,
                    TIPO = 'Y',
                    PANICO = 'N',
                    TIPOUSO = 'N',
                    USR = ?,
                    VEICULO = ?
                WHERE SEQUENCIA = ?
            `, [ownerSeq, tag, tag, user, vehicleSeq, primaryAccess.SEQUENCIA]);
        } else {
            await txQuery(tx, `
                INSERT INTO IDACESSO (SEQPESSOA, ID, ID2, TIPO, PANICO, TIPOUSO, USR, VEICULO)
                VALUES (?, ?, ?, 'Y', 'N', 'N', ?, ?)
            `, [ownerSeq, tag, tag, user, vehicleSeq]);
        }

        await txQuery(tx, `
            UPDATE VEICULOS
            SET TAGVEICULO = ?
            WHERE SEQUENCIA = ?
        `, [tag, vehicleSeq]);

        return {
            status: currentTag && currentTag !== tag ? 'swapped' : 'linked',
            vehicleSeq,
            tag,
        };
    });
};

export const deleteTagByVehicleSeq = async (vehicleSeq: number): Promise<{ vehicleSeq: number; tagRemoved: boolean }> => {
    return executeTransaction(async (tx) => {
        const vehicle = firstRow<VehicleRow>(await txQuery<VehicleRow>(tx, `
            SELECT
                v.SEQUENCIA,
                v.PLACA,
                v.MARCA,
                v.MODELO,
                v.COR,
                v.SEQUNIDADE,
                v.PROPRIETARIO,
                v.TAGVEICULO
            FROM VEICULOS v
            WHERE v.SEQUENCIA = ?
        `, [vehicleSeq]));

        if (!vehicle) {
            throw Object.assign(new Error('Veiculo nao encontrado.'), { status: 404 });
        }

        const accessRows = asRows<{ SEQUENCIA: number }>(await txQuery<{ SEQUENCIA: number }>(tx, `
            SELECT i.SEQUENCIA
            FROM IDACESSO i
            WHERE i.VEICULO = ?
        `, [vehicleSeq]));

        for (const row of accessRows) {
            // eslint-disable-next-line no-await-in-loop
            await txQuery(tx, `DELETE FROM IDACESSO WHERE SEQUENCIA = ?`, [row.SEQUENCIA]);
        }

        await txQuery(tx, `
            UPDATE VEICULOS
            SET TAGVEICULO = NULL
            WHERE SEQUENCIA = ?
        `, [vehicleSeq]);

        return {
            vehicleSeq,
            tagRemoved: accessRows.length > 0 || Boolean(vehicle.TAGVEICULO),
        };
    });
};

export const unlinkOwnerByVehicleSeq = async (vehicleSeq: number): Promise<{
    vehicleSeq: number;
    ownerUnlinked: boolean;
    tagRemoved: boolean;
}> => {
    return executeTransaction(async (tx) => {
        const vehicle = firstRow<VehicleRow>(await txQuery<VehicleRow>(tx, `
            SELECT
                v.SEQUENCIA,
                v.PLACA,
                v.MARCA,
                v.MODELO,
                v.COR,
                v.SEQUNIDADE,
                v.PROPRIETARIO,
                v.TAGVEICULO
            FROM VEICULOS v
            WHERE v.SEQUENCIA = ?
        `, [vehicleSeq]));

        if (!vehicle) {
            throw Object.assign(new Error('Veiculo nao encontrado.'), { status: 404 });
        }

        const accessRows = asRows<{ SEQUENCIA: number }>(await txQuery<{ SEQUENCIA: number }>(tx, `
            SELECT i.SEQUENCIA
            FROM IDACESSO i
            WHERE i.VEICULO = ?
        `, [vehicleSeq]));

        for (const row of accessRows) {
            // eslint-disable-next-line no-await-in-loop
            await txQuery(tx, `DELETE FROM IDACESSO WHERE SEQUENCIA = ?`, [row.SEQUENCIA]);
        }

        await txQuery(tx, `
            UPDATE VEICULOS
            SET
                TAGVEICULO = NULL,
                PROPRIETARIO = 0
            WHERE SEQUENCIA = ?
        `, [vehicleSeq]);

        return {
            vehicleSeq,
            ownerUnlinked: true,
            tagRemoved: accessRows.length > 0 || Boolean(vehicle.TAGVEICULO),
        };
    });
};
