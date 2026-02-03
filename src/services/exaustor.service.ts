import axios from 'axios';

/**
 * Torres disponíveis.
 */
type Tower = 'A' | 'B' | 'C';
/**
 * Grupos de finais (1-4 ou 5-8).
 */
type Group = '14' | '58';

/**
 * Mapeamento de módulos para seus respectivos hosts.
 */
const EXAUSTOR_HOSTS: Record<string, string | undefined> = {
    A_14: process.env.EXAUSTOR_A_14_HOST,
    A_58: process.env.EXAUSTOR_A_58_HOST,
    B_14: process.env.EXAUSTOR_B_14_HOST,
    B_58: process.env.EXAUSTOR_B_58_HOST,
    C_14: process.env.EXAUSTOR_C_14_HOST,
    C_58: process.env.EXAUSTOR_C_58_HOST,
    PWR_14: process.env.EXAUSTOR_PWR_14_HOST,
    PWR_58: process.env.EXAUSTOR_PWR_58_HOST,
};

/**
 * Porta dos módulos Tasmota.
 */
const EXAUSTOR_PORT = Number(process.env.EXAUSTOR_PORT || 80);
/**
 * Timeout das chamadas HTTP.
 */
const EXAUSTOR_TIMEOUT_MS = Number(process.env.EXAUSTOR_TIMEOUT_MS || 30000);

/**
 * Estado em memória de um exaustor.
 */
type ExaustorState = {
    id: string;
    tower: Tower;
    final: number;
    group: Group;
    relay: number;
    moduleId: string;
    expiresAt: number | null;
    timer?: NodeJS.Timeout;
};

/**
 * Memória dos exaustores ligados e seus timers.
 */
const exaustorStates = new Map<string, ExaustorState>();

/**
 * Normaliza o ID do apartamento.
 * @param id Identificador do exaustor.
 */
const normalizeApartmentId = (id: string) => id.trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '_');

/**
 * Resolve o host do módulo.
 * @param moduleId ID do módulo (ex: A_14).
 * @returns Host configurado.
 */
const resolveModuleHost = (moduleId: string): string => {
    const normalized = moduleId.trim().toUpperCase();
    const host = EXAUSTOR_HOSTS[normalized];
    if (!host) {
        throw new Error(`Host não configurado para o módulo: ${moduleId}`);
    }
    return host;
};

/**
 * Monta a URL base do Tasmota.
 * @param host IP/host do módulo.
 */
const buildUrl = (host: string): string => {
    const portPart = EXAUSTOR_PORT ? `:${EXAUSTOR_PORT}` : '';
    return `http://${host}${portPart}/cm`;
};

/**
 * Envia um comando ao módulo Tasmota.
 * @param host IP/host do módulo.
 * @param cmnd Comando Tasmota.
 * @returns Resposta bruta do módulo.
 */
const sendCommand = async (host: string, cmnd: string): Promise<any> => {
    const url = buildUrl(host);
    const config = { params: { cmnd }, timeout: EXAUSTOR_TIMEOUT_MS };
    const response = await axios.get(url, config);
    return response.data;
};

/**
 * Mapeamento de índices para módulos (1-based).
 */
const MODULE_INDEX_MAP = ['A_14', 'A_58', 'B_14', 'B_58', 'C_14', 'C_58', 'PWR_14', 'PWR_58'];

/**
 * Resolve o host a partir do identificador do módulo.
 * @param module Identificador do módulo (nome, índice ou IP).
 * @returns Host configurado.
 */
const resolveHostByModule = (module: string): string => {
    const normalized = module.trim();

    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
        return normalized;
    }

    const upper = normalized.toUpperCase();
    if (EXAUSTOR_HOSTS[upper]) {
        return resolveModuleHost(upper);
    }

    const index = Number(normalized);
    if (Number.isFinite(index) && index >= 1 && index <= MODULE_INDEX_MAP.length) {
        return resolveModuleHost(MODULE_INDEX_MAP[index - 1]);
    }

    throw new Error(`Módulo inválido: ${module}`);
};

/**
 * Envia comando bruto via backlog (sem re-encode).
 * @param host IP/host do módulo.
 * @param command Comando já encodado para o Tasmota.
 * @returns Resposta bruta do módulo.
 */
const sendRawCommand = async (host: string, command: string): Promise<any> => {
    const url = `${buildUrl(host)}?cmnd=${command}`;
    const response = await axios.get(url, { timeout: EXAUSTOR_TIMEOUT_MS });
    return response.data;
};

/**
 * Lista todos os módulos configurados com host válido.
 * @returns Lista de módulos com seu host.
 */
const listModules = (): { moduleId: string; host: string }[] => {
    return Object.entries(EXAUSTOR_HOSTS)
        .filter(([, host]) => Boolean(host))
        .map(([moduleId, host]) => ({ moduleId, host: host as string }));
};

/**
 * Converte o ID do exaustor em metadados de torre, final e relé.
 * @param id Identificador (A1, A-1, A_1).
 * @returns Metadados do exaustor.
 */
const parseApartment = (id: string): { tower: Tower; final: number; relay: number; group: Group; moduleId: string } => {
    const normalized = normalizeApartmentId(id);
    const match = normalized.match(/^(A|B|C)_?([1-8])$/i);

    if (!match) {
        throw new Error('ID do exaustor inválido. Use formato A1, A-1, A_1 (torre A/B/C e final 1-8).');
    }

    const tower = match[1].toUpperCase() as Tower;
    const final = Number(match[2]);
    const group: Group = final <= 4 ? '14' : '58';
    const relay = final <= 4 ? final : final - 4;
    const moduleId = `${tower}_${group}`;

    return { tower, final, relay, group, moduleId };
};

/**
 * Retorna o relé do módulo PWR correspondente à torre.
 * @param tower Torre.
 * @returns Número do relé do PWR.
 */
const getPwrRelayForTower = (tower: Tower): number => {
    if (tower === 'A') return 1;
    if (tower === 'B') return 2;
    return 3;
};

/**
 * Agenda o desligamento automático em memória.
 * @param state Estado do exaustor.
 * @param minutes Minutos para desligar.
 */
const scheduleOffTimer = (state: ExaustorState, minutes: number): void => {
    if (state.timer) {
        clearTimeout(state.timer);
    }

    const timeoutMs = Math.round(minutes * 60 * 1000);
    state.expiresAt = Date.now() + timeoutMs;
    state.timer = setTimeout(async () => {
        try {
            await turnOffExaustor(state.id);
        } catch (error) {
            console.error('[Exaustor] Falha ao desligar automaticamente:', error);
        }
    }, timeoutMs);
};

/**
 * Atualiza o estado em memória e agenda desligamento se necessário.
 * @param state Estado do exaustor.
 * @param minutes Minutos para desligar.
 */
const setState = (state: ExaustorState, minutes?: number): void => {
    if (minutes && minutes > 0) {
        scheduleOffTimer(state, minutes);
    } else {
        state.expiresAt = null;
    }

    exaustorStates.set(state.id, state);
};

/**
 * Remove o estado em memória.
 * @param id Identificador do exaustor.
 */
const clearState = (id: string): void => {
    const normalizedId = normalizeApartmentId(id);
    const state = exaustorStates.get(normalizedId);
    if (state?.timer) {
        clearTimeout(state.timer);
    }
    exaustorStates.delete(normalizedId);
};

/**
 * Calcula minutos restantes para desligamento.
 * @param state Estado do exaustor.
 * @returns Minutos restantes ou null.
 */
const getRemainingMinutes = (state: ExaustorState): number | null => {
    if (!state.expiresAt) return null;
    const remainingMs = state.expiresAt - Date.now();
    if (remainingMs <= 0) return null;
    return Math.ceil(remainingMs / 60000);
};

/**
 * Cria um snapshot serializável dos acionamentos em memória.
 * @returns Lista de acionamentos com tempo restante.
 */
const buildMemorySnapshot = () => {
    return Array.from(exaustorStates.values()).map((state) => ({
        id: state.id,
        tower: state.tower,
        final: state.final,
        group: state.group,
        relay: state.relay,
        moduleId: state.moduleId,
        expiresAt: state.expiresAt,
        remainingMinutes: getRemainingMinutes(state),
    }));
};

/**
 * Envia pulso e comando de ligar para um relé.
 * @param moduleHost Host do módulo.
 * @param relay Número do relé.
 * @returns Respostas dos comandos (pulso e power on).
 */
const setRelay = async (moduleHost: string, relay: number): Promise<any[]> => {
    const onCommand = `Power${relay} On`;
    const onResult = await sendCommand(moduleHost, onCommand);
    return [onResult];
};

/**
 * Liga um exaustor por pulso no relé.
 * @param id Identificador do exaustor.
 * @param minutes Minutos para permanecer ligado.
 * @returns Resposta do módulo Tasmota.
 */
export const turnOnExaustor = async (id: string, minutes?: number): Promise<any> => {
    const normalizedId = normalizeApartmentId(id);
    const { tower, final, relay, group, moduleId } = parseApartment(normalizedId);
    const host = resolveModuleHost(moduleId);

    const result = await setRelay(host, relay);

    setState({
        id: normalizedId,
        tower,
        final,
        relay,
        group,
        moduleId,
        expiresAt: null,
    }, minutes);

    return result;
};

/**
 * Desliga um exaustor via módulo PWR e religa os demais do grupo.
 * @param id Identificador do exaustor.
 * @returns Resultado do desligamento e reativações.
 */
export const turnOffExaustor = async (id: string): Promise<any> => {
    const normalizedId = normalizeApartmentId(id);
    const { tower, relay, group } = parseApartment(normalizedId);
    const pwrModuleId = `PWR_${group}`;
    const pwrHost = resolveModuleHost(pwrModuleId);
    const pwrRelay = getPwrRelayForTower(tower);

    const offResult = await setRelay(pwrHost, pwrRelay);

    clearState(normalizedId);

    const statesToRestore = Array.from(exaustorStates.values())
        .filter((state) => state.tower === tower && state.group === group);

    const restoreResults: Record<string, any> = {};

    for (const state of statesToRestore) {
        const moduleHost = resolveModuleHost(state.moduleId);
        restoreResults[state.id] = await setRelay(moduleHost, state.relay);
        const remaining = getRemainingMinutes(state);
        if (remaining) {
            scheduleOffTimer(state, remaining);
        }
    }

    return { offResult, restoreResults };
};

/**
 * Consulta status do exaustor ou do módulo.
 * @param id Identificador do exaustor (A1) ou módulo (A_14/PWR_14).
 * @returns Status retornado pelo módulo.
 */
export const getExaustorStatus = async (id: string): Promise<any> => {
    const normalized = normalizeApartmentId(id);
    const moduleMatch = normalized.match(/^(A|B|C|PWR)_(14|58)$/i);

    if (moduleMatch) {
        const moduleId = `${moduleMatch[1].toUpperCase()}_${moduleMatch[2]}`;
        const host = resolveModuleHost(moduleId);
        return sendCommand(host, 'Status');
    }

    const { relay, moduleId } = parseApartment(normalized);
    const host = resolveModuleHost(moduleId);
    return sendCommand(host, `Power${relay}`);
};

/**
 * Retorna o status de todos os módulos e a memória de acionamentos.
 * @returns Status por módulo e memória serializada.
 */
export const getAllModulesStatus = async (): Promise<{ modules: Record<string, any>; memory: ReturnType<typeof buildMemorySnapshot> }> => {
    const modules = listModules();
    const results = await Promise.all(modules.map(async ({ moduleId, host }) => {
        try {
            const status = await sendCommand(host, 'Status');
            return { moduleId, status };
        } catch (error: any) {
            return { moduleId, status: null, error: error?.message ?? String(error) };
        }
    }));

    const modulesStatus = results.reduce<Record<string, any>>((acc, item) => {
        acc[item.moduleId] = item;
        return acc;
    }, {});

    return {
        modules: modulesStatus,
        memory: buildMemorySnapshot(),
    };
};

/**
 * Configura um módulo via backlog.
 * @param module Identificador do módulo (nome, índice ou IP).
 * @param command Comando backlog já encodado.
 * @returns Resposta do módulo.
 */
export const configureExaustorModule = async (module: string, command: string): Promise<any> => {
    const host = resolveHostByModule(module);
    return sendRawCommand(host, command);
};

/**
 * Retorna o estado em memória de um exaustor.
 * @param id Identificador do exaustor.
 * @returns Estado em memória ou null.
 */
export const getExaustorMemory = (id: string): ExaustorState | null => {
    const normalizedId = normalizeApartmentId(id);
    return exaustorStates.get(normalizedId) ?? null;
};
