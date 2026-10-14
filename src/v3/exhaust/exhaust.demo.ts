import { EventEmitter } from 'node:events';
import logger from '../../core/utils/logger';

// =============================================================================
// Exaustor SIMULADO para a conta de revisão das lojas (Google Play), decisão
// de 14/10/2026. A conta de teste é vinculada a uma unidade fictícia do ERP
// (ex.: XYZ-100), que não corresponde a nenhum exaustor real. As unidades em
// EXHAUST_DEMO_UNITS ganham um exaustor que existe só em memória: liga,
// reinicia o tempo, desliga e desliga sozinho como o real, gera os mesmos
// eventos e avisos, mas nenhum comando chega a um relé.
//
// A verificação de localização não se aplica a ele (não há equipamento a
// proteger), então o revisor consegue testar de qualquer lugar. Exaustores
// reais continuam exigindo a área do condomínio, inclusive para esta conta.
// =============================================================================

/** Tempo de "Ligando…"/"Desligando…", para o app mostrar a transição como no real. */
const TRANSITION_MS = 1_500;
const SWEEP_MS = 5_000;

export type DemoMemory = {
    pendingCommand: 'ligar' | 'desligar';
    processStatus: 'iniciando' | 'executado';
    expiresAt: number | null;
};

type DemoExhaust = { id: string; tower: string; final: number };

/** Emite 'changed' (id) a cada mudança, como o exhaustEvents do core. */
export const demoExhaustEvents = new EventEmitter();

const states = new Map<string, DemoMemory>();
const pending = new Map<string, NodeJS.Timeout>();

const toDemoExhaust = (quadra: string, lote: string): DemoExhaust | null => {
    const tower = quadra.trim().toUpperCase();
    const final = lote.trim().match(/(\d)\D*$/)?.[1];
    if (!tower || !final) return null;
    return { id: `${tower}${final}`, tower, final: Number(final) };
};

// Lida dentro da função: imports resolvem antes do dotenv.config().
const configuredUnits = (): Map<string, DemoExhaust> => {
    const units = new Map<string, DemoExhaust>();
    for (const label of (process.env.EXHAUST_DEMO_UNITS ?? '').split(',')) {
        const [quadra, lote] = label.trim().toUpperCase().split('-');
        const exhaust = quadra && lote ? toDemoExhaust(quadra, lote) : null;
        if (exhaust) units.set(`${quadra}-${lote}`, exhaust);
    }
    return units;
};

/** Exaustor simulado da unidade, ou null se ela não for de demonstração. */
export const demoExhaustIdForUnit = (quadra: string, lote: string): string | null =>
    configuredUnits().get(`${quadra.trim().toUpperCase()}-${lote.trim().toUpperCase()}`)?.id ?? null;

export const listDemoExhaustIds = (): string[] => [...new Set([...configuredUnits().values()].map((item) => item.id))];

export const isDemoExhaust = (id: string): boolean => listDemoExhaustIds().includes(id);

const describe = (id: string) => [...configuredUnits().values()].find((item) => item.id === id);

/** Mesmo formato da memória do core, para o push ler o simulado igual ao real. */
export const getDemoMemory = (id: string): DemoMemory | null => states.get(id) ?? null;

export const demoToExhaust = (id: string) => {
    const memory = states.get(id);
    const unit = describe(id);
    return {
        id,
        tower: unit?.tower ?? id.slice(0, -1),
        final: unit?.final ?? Number(id.slice(-1)),
        on: memory?.pendingCommand === 'ligar',
        expiresAt: memory?.expiresAt ?? null,
        processStatus: memory?.processStatus ?? null,
        moduleOnline: true,
        command: memory?.pendingCommand ?? null,
        maintenance: false,
        simulated: true,
    };
};

const set = (id: string, memory: DemoMemory | null) => {
    if (memory) states.set(id, memory);
    else states.delete(id);
    demoExhaustEvents.emit('changed', id);
};

const settle = (id: string, after: () => void) =>
    new Promise<void>((resolve) => {
        clearTimeout(pending.get(id));
        pending.set(id, setTimeout(() => {
            pending.delete(id);
            after();
            resolve();
        }, TRANSITION_MS));
    });

/** Liga ou, se já estiver ligado, reinicia o tempo (como o /on real). */
export const demoTurnOn = async (id: string, minutes?: number): Promise<void> => {
    const expiresAt = minutes ? Date.now() + minutes * 60_000 : null;
    const current = states.get(id);
    if (current?.pendingCommand === 'ligar' && current.processStatus === 'executado') {
        set(id, { ...current, expiresAt });
        return;
    }
    set(id, { pendingCommand: 'ligar', processStatus: 'iniciando', expiresAt });
    await settle(id, () => set(id, { pendingCommand: 'ligar', processStatus: 'executado', expiresAt }));
    logger.info(`[ApiV3] Exaustor ${id} (simulado) ligado`);
};

export const demoTurnOff = async (id: string): Promise<void> => {
    set(id, { pendingCommand: 'desligar', processStatus: 'iniciando', expiresAt: states.get(id)?.expiresAt ?? null });
    await settle(id, () => set(id, null));
    logger.info(`[ApiV3] Exaustor ${id} (simulado) desligado`);
};

// Desligamento automático ao fim do prazo, como a varredura do core.
setInterval(() => {
    const now = Date.now();
    for (const [id, memory] of states) {
        if (memory.pendingCommand === 'ligar' && memory.processStatus === 'executado' && memory.expiresAt !== null && memory.expiresAt <= now) {
            demoTurnOff(id).catch((error) => logger.error(`[ApiV3] Falha ao desligar o exaustor simulado ${id}:`, error));
        }
    }
}, SWEEP_MS).unref();
