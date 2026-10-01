import fs from 'fs';
import path from 'path';
import logger from '../../core/utils/logger';
import { exhaustEvents } from '../../core/services/exhaust.service';

// =============================================================================
// Manutenção dos exaustores (tela 20 do app). Fica na v3, fora do core, para
// não alterar o comportamento da v2: o painel legado continua acionando um
// exaustor marcado em manutenção — limitação conhecida e documentada.
//
// Persistido em arquivo ao lado da memória de acionamentos (mesmo volume
// `storage/exhaust`), com gravação atômica via arquivo temporário.
// =============================================================================

const MAINTENANCE_DIR = path.resolve(process.env.EXHAUST_MEMORY_DIR || path.join(process.cwd(), 'storage', 'exhaust'));
const MAINTENANCE_FILE = path.join(MAINTENANCE_DIR, 'maintenance.json');

let cache: Set<string> | null = null;

const load = (): Set<string> => {
    if (cache) return cache;
    cache = new Set();
    try {
        if (fs.existsSync(MAINTENANCE_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(MAINTENANCE_FILE, 'utf8') || '{}') as { ids?: unknown };
            if (Array.isArray(parsed.ids)) parsed.ids.filter((id): id is string => typeof id === 'string').forEach((id) => cache!.add(id));
        }
    } catch (error) {
        logger.error(`[ApiV3] Falha ao ler manutenção dos exaustores: ${String(error)}`);
    }
    return cache;
};

export const isInMaintenance = (id: string): boolean => load().has(id);

export const setMaintenance = (id: string, maintenance: boolean): void => {
    const ids = new Set(load());
    if (maintenance) ids.add(id); else ids.delete(id);
    fs.mkdirSync(MAINTENANCE_DIR, { recursive: true });
    const tempPath = `${MAINTENANCE_FILE}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify({ updatedAt: new Date().toISOString(), ids: [...ids].sort() }, null, 2), 'utf8');
    fs.renameSync(tempPath, MAINTENANCE_FILE);
    cache = ids;
    // O gateway WebSocket recalcula os exaustores neste evento e publica
    // `exhaust.changed` para quem enxerga o equipamento.
    exhaustEvents.emit('memory.changed');
};
