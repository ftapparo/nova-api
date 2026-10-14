// =============================================================================
// Área do condomínio para ligar o exaustor (decisão de 13/10/2026): o
// morador só liga ou reinicia dentro dela; a equipe é isenta. A área é um
// círculo (centro + raio) configurado no servidor, nunca no app.
//
// As coordenadas recebidas só são comparadas aqui: não são gravadas nem
// registradas em log (Política de Privacidade 8-A.4).
// =============================================================================

export type CommandLocation = { latitude: number; longitude: number; accuracy: number; mock: boolean };
export type Geofence = { latitude: number; longitude: number; radiusMeters: number; maxAccuracyMeters: number };
export type LocationCheck = 'missing' | 'mock' | 'inaccurate' | 'outside' | 'inside';

const DEFAULT_MAX_ACCURACY_METERS = 100;
const EARTH_RADIUS_METERS = 6_371_000;

const toNumber = (value: string | undefined): number | null => {
    if (value === undefined || value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

/** Lido a cada comando: a área pode ser ajustada no ambiente sem rebuild. Null = não configurada. */
export const resolveGeofence = (): Geofence | null => {
    const latitude = toNumber(process.env.EXHAUST_GEOFENCE_LAT);
    const longitude = toNumber(process.env.EXHAUST_GEOFENCE_LNG);
    const radiusMeters = toNumber(process.env.EXHAUST_GEOFENCE_RADIUS_M);
    const maxAccuracyMeters = toNumber(process.env.EXHAUST_GEOFENCE_MAX_ACCURACY_M) ?? DEFAULT_MAX_ACCURACY_METERS;
    if (latitude === null || longitude === null || radiusMeters === null) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || radiusMeters <= 0 || maxAccuracyMeters <= 0) return null;
    return { latitude, longitude, radiusMeters, maxAccuracyMeters };
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Distância em metros sobre a esfera (haversine); suficiente para algumas centenas de metros. */
export const distanceMeters = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
    const dLat = toRadians(bLat - aLat);
    const dLng = toRadians(bLng - aLng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
};

/**
 * Aceita quando o círculo de precisão do aparelho toca a área: dentro do
 * prédio o GPS erra dezenas de metros, e exigir o ponto exato recusaria
 * moradores em casa. O teto de precisão impede que um círculo enorme
 * "toque" a área de qualquer lugar da cidade.
 */
export const checkLocation = (location: CommandLocation | undefined, fence: Geofence): LocationCheck => {
    if (!location) return 'missing';
    if (location.mock) return 'mock';
    if (location.accuracy > fence.maxAccuracyMeters) return 'inaccurate';
    const distance = distanceMeters(fence.latitude, fence.longitude, location.latitude, location.longitude);
    return distance - location.accuracy <= fence.radiusMeters ? 'inside' : 'outside';
};

/** Títulos estáveis do 403: o app compara o `title`, nunca o `detail`. */
export const LOCATION_REJECTIONS: Record<Exclude<LocationCheck, 'inside'>, { title: string; detail: string }> = {
    missing: { title: 'Localização necessária', detail: 'Envie a localização do aparelho para ligar o exaustor.' },
    mock: { title: 'Localização simulada', detail: 'O comando não é aceito com localização simulada.' },
    inaccurate: { title: 'Localização imprecisa', detail: 'Não foi possível confirmar a localização com precisão.' },
    outside: { title: 'Fora da área do condomínio', detail: 'É preciso estar no condomínio para ligar o exaustor.' },
};
