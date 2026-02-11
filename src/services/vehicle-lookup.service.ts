import axios from 'axios';

type LookupData = {
    brand: string | null;
    model: string | null;
    color: string | null;
};

export type VehicleLookupSourceResult = {
    name: string;
    success: boolean;
    durationMs: number;
    message: string;
    data: LookupData | null;
};

export type VehicleLookupResult = {
    plate: string;
    sources: VehicleLookupSourceResult[];
    consolidated: {
        brand: string | null;
        model: string | null;
        color: string | null;
        sourceUsedByField: {
            brand: string | null;
            model: string | null;
            color: string | null;
        };
    };
    overallSuccess: boolean;
};

type ProviderConfig = {
    name: string;
    url: string | null;
};

const DEFAULT_TIMEOUT_MS = Number(process.env.VEHICLE_LOOKUP_TIMEOUT_MS || '5000');

const providerConfigs: ProviderConfig[] = [
    { name: 'API1', url: process.env.VEHICLE_LOOKUP_PROVIDER_1_URL?.trim() || null },
    { name: 'API2', url: process.env.VEHICLE_LOOKUP_PROVIDER_2_URL?.trim() || null },
    { name: 'API3', url: process.env.VEHICLE_LOOKUP_PROVIDER_3_URL?.trim() || null },
];

const normalizeText = (value: unknown): string | null => {
    const text = String(value ?? '').trim();
    return text ? text : null;
};

const resolveProviderUrl = (template: string, plate: string): string => {
    if (template.includes('{plate}')) {
        return template.split('{plate}').join(encodeURIComponent(plate));
    }

    const separator = template.includes('?') ? '&' : '?';
    return `${template}${separator}plate=${encodeURIComponent(plate)}`;
};

const pickField = (payload: any, keys: string[]): string | null => {
    for (const key of keys) {
        if (payload?.[key] !== undefined && payload?.[key] !== null) {
            const value = normalizeText(payload[key]);
            if (value) return value;
        }
    }

    return null;
};

const extractLookupData = (payload: any): LookupData => {
    const root = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    const vehicle = root?.vehicle && typeof root.vehicle === 'object' ? root.vehicle : root;

    return {
        brand: pickField(vehicle, ['brand', 'marca', 'MARCA', 'make']),
        model: pickField(vehicle, ['model', 'modelo', 'MODELO']),
        color: pickField(vehicle, ['color', 'cor', 'COR']),
    };
};

const requestProvider = async (provider: ProviderConfig, plate: string): Promise<VehicleLookupSourceResult> => {
    const startedAt = Date.now();

    if (!provider.url) {
        return {
            name: provider.name,
            success: false,
            durationMs: 0,
            message: 'Provider URL nao configurada.',
            data: null,
        };
    }

    try {
        const url = resolveProviderUrl(provider.url, plate);
        const response = await axios.get(url, {
            timeout: Number.isFinite(DEFAULT_TIMEOUT_MS) && DEFAULT_TIMEOUT_MS > 0 ? DEFAULT_TIMEOUT_MS : 5000,
            validateStatus: () => true,
        });
        const durationMs = Date.now() - startedAt;

        if (response.status < 200 || response.status >= 300) {
            return {
                name: provider.name,
                success: false,
                durationMs,
                message: `HTTP ${response.status}`,
                data: null,
            };
        }

        const data = extractLookupData(response.data);
        const hasAnyData = Boolean(data.brand || data.model || data.color);

        return {
            name: provider.name,
            success: hasAnyData,
            durationMs,
            message: hasAnyData ? 'Consulta realizada com sucesso.' : 'Consulta sem dados de veiculo.',
            data: hasAnyData ? data : null,
        };
    } catch (error: any) {
        return {
            name: provider.name,
            success: false,
            durationMs: Date.now() - startedAt,
            message: error?.message ?? 'Erro ao consultar provider.',
            data: null,
        };
    }
};

const consolidateByPriority = (sources: VehicleLookupSourceResult[]) => {
    const resolveField = (field: keyof LookupData): { value: string | null; source: string | null } => {
        for (const source of sources) {
            const value = source.data?.[field] ?? null;
            if (value) {
                return { value, source: source.name };
            }
        }

        return { value: null, source: null };
    };

    const brand = resolveField('brand');
    const model = resolveField('model');
    const color = resolveField('color');

    return {
        consolidated: {
            brand: brand.value,
            model: model.value,
            color: color.value,
            sourceUsedByField: {
                brand: brand.source,
                model: model.source,
                color: color.source,
            },
        },
        overallSuccess: Boolean(brand.value || model.value || color.value),
    };
};

export const lookupVehicleExternalSources = async (plate: string): Promise<VehicleLookupResult> => {
    const sources: VehicleLookupSourceResult[] = [];

    for (const provider of providerConfigs) {
        // Priority is provider order.
        // eslint-disable-next-line no-await-in-loop
        const sourceResult = await requestProvider(provider, plate);
        sources.push(sourceResult);
    }

    const merged = consolidateByPriority(sources);

    return {
        plate,
        sources,
        consolidated: merged.consolidated,
        overallSuccess: merged.overallSuccess,
    };
};
