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
 * Delay entre reativações de relés (ms).
 */
const EXAUSTOR_REARM_DELAY_MS = 2000;

/**
 * Intervalo de varredura para desligar expirados (ms).
 */
const EXAUSTOR_SWEEP_INTERVAL_MS = Number(process.env.EXAUSTOR_SWEEP_INTERVAL_MS || 60000);

const EXPECTED_PULSE_TIME = 5;
const EXPECTED_RELAY_COUNT = 4;

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

type ModuleStatusCache = {
    status: any;
    pulseTime: any;
    updatedAt: number;
    errorCode?: string | null;
    error?: string | null;
};

/**
 * Cache de status dos módulos.
 */
const modulesStatusCache = new Map<string, ModuleStatusCache>();

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
 * Atualiza o cache com os dados coletados do módulo.
 * @param moduleId Identificador do módulo.
 * @param status Status retornado.
 * @param pulseTime PulseTime retornado.
 */
const updateModuleCache = (moduleId: string, status: any, pulseTime: any): void => {
    modulesStatusCache.set(moduleId, {
        status,
        pulseTime,
        updatedAt: Date.now(),
        errorCode: null,
        error: null,
    });
};

/**
 * Atualiza o cache com erro para o módulo.
 * @param moduleId Identificador do módulo.
 * @param errorCode Código do erro.
 * @param error Mensagem do erro.
 */
const updateModuleCacheError = (moduleId: string, errorCode: string, error: unknown): void => {
    modulesStatusCache.set(moduleId, {
        status: null,
        pulseTime: null,
        updatedAt: Date.now(),
        errorCode,
        error: error ? String(error) : null,
    });
};

/**
 * Força desligamento de todos os relés do módulo.
 * @param host Host do módulo.
 */
const forceModuleOff = async (host: string): Promise<void> => {
    for (let relay = 1; relay <= EXPECTED_RELAY_COUNT; relay += 1) {
        await sendCommand(host, `Power${relay} Off`);
    }
};

/**
 * Garante que os 4 primeiros PulseTime estão configurados corretamente.
 * @param host Host do módulo.
 * @param pulseTime Resposta atual de PulseTime.
 */
const ensurePulseTime = async (host: string, pulseTime: any): Promise<void> => {
    const setValues = Array.isArray(pulseTime?.PulseTime?.Set)
        ? pulseTime.PulseTime.Set
        : [];

    for (let relay = 1; relay <= EXPECTED_RELAY_COUNT; relay += 1) {
        const current = setValues[relay - 1];
        if (current !== EXPECTED_PULSE_TIME) {
            console.log('[ExaustorService] Corrigindo PulseTime', {
                relay,
                atual: current,
                esperado: EXPECTED_PULSE_TIME,
            });
            await sendCommand(host, `PulseTime${relay} ${EXPECTED_PULSE_TIME}`);
        }
    }
};

/**
 * Inicializa o módulo: lê status, desliga relés e valida PulseTime.
 * @param moduleId Identificador do módulo.
 * @param host Host do módulo.
 */
const initializeModule = async (moduleId: string, host: string): Promise<void> => {
    console.log('[ExaustorService] Inicializando módulo', { moduleId, host });

    // 1. Consulta status inicial
    let status: any;
    try {
        status = await sendCommand(host, 'Status');
        console.log('[ExaustorService] Status recebido', { moduleId });
    } catch (error) {
        updateModuleCacheError(moduleId, 'STATUS_READ_FAILED', error);
        console.error('[ExaustorService] Falha ao ler Status', { moduleId, error });
        throw error;
    }

    // 2. Força desligamento de todos os relés
    try {
        await forceModuleOff(host);
        console.log('[ExaustorService] Relés desligados', { moduleId });
    } catch (error) {
        updateModuleCacheError(moduleId, 'POWER_OFF_FAILED', error);
        console.error('[ExaustorService] Falha ao desligar relés', { moduleId, error });
        throw error;
    }

    // 3. Valida PulseTime
    let pulseTime: any;
    try {
        pulseTime = await sendCommand(host, 'PulseTime');
        console.log('[ExaustorService] PulseTime recebido', {
            moduleId,
            pulseTime: JSON.stringify(pulseTime),
        });
    } catch (error) {
        updateModuleCacheError(moduleId, 'PULSETIME_READ_FAILED', error);
        console.error('[ExaustorService] Falha ao ler PulseTime', { moduleId, error });
        throw error;
    }

    try {
        await ensurePulseTime(host, pulseTime);
        console.log('[ExaustorService] PulseTime validado', { moduleId });
    } catch (error) {
        updateModuleCacheError(moduleId, 'PULSETIME_CONFIG_FAILED', error);
        console.error('[ExaustorService] Falha ao configurar PulseTime', { moduleId, error });
        throw error;
    }

    // 4. Corrige PulseTime se necessário
    let refreshedPulseTime: any;
    try {
        refreshedPulseTime = await sendCommand(host, 'PulseTime');
        console.log('[ExaustorService] PulseTime final', {
            moduleId,
            pulseTime: JSON.stringify(refreshedPulseTime),
        });
    } catch (error) {
        updateModuleCacheError(moduleId, 'PULSETIME_VERIFY_FAILED', error);
        console.error('[ExaustorService] Falha ao verificar PulseTime', { moduleId, error });
        throw error;
    }

    const finalValues = Array.isArray(refreshedPulseTime?.PulseTime?.Set)
        ? refreshedPulseTime.PulseTime.Set
        : [];
    const hasMismatch = Array.from({ length: EXPECTED_RELAY_COUNT }).some((_, index) => finalValues[index] !== EXPECTED_PULSE_TIME);
    if (hasMismatch) {
        const error = 'PulseTime final diferente do esperado';
        updateModuleCacheError(moduleId, 'PULSETIME_VERIFY_FAILED', error);
        console.error('[ExaustorService] PulseTime final inválido', { moduleId, finalValues });
        throw new Error(error);
    }

    // 5. Atualiza cache de status
    updateModuleCache(moduleId, status, refreshedPulseTime);
    console.log('[ExaustorService] Módulo inicializado', { moduleId });
};

/**
 * Atualiza o status e pulsetime de um módulo.
 * @param moduleId Identificador do módulo.
 * @param host Host do módulo.
 */
const refreshModuleStatus = async (moduleId: string, host: string): Promise<void> => {
    try {
        const [status, pulseTime] = await Promise.all([
            sendCommand(host, 'Status'),
            sendCommand(host, 'PulseTime'),
        ]);

        if (!status) {
            updateModuleCacheError(moduleId, 'STATUS_READ_FAILED', 'Status vazio');
            return;
        }

        modulesStatusCache.set(moduleId, {
            status,
            pulseTime,
            updatedAt: Date.now(),
            errorCode: null,
            error: null,
        });
    } catch (error: any) {
        updateModuleCacheError(moduleId, 'STATUS_READ_FAILED', error);
    }
};

/**
 * Atualiza o status de todos os módulos.
 */
const refreshAllModulesStatus = async (): Promise<void> => {
    const modules = listModules();
    for (const { moduleId, host } of modules) {
        await refreshModuleStatus(moduleId, host);
    }
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
 * Ajusta a expiração em memória.
 * @param state Estado do exaustor.
 * @param minutes Minutos para desligar.
 */
const setExpiry = (state: ExaustorState, minutes: number): void => {
    const timeoutMs = Math.round(minutes * 60 * 1000);
    state.expiresAt = Date.now() + timeoutMs;
};

/**
 * Processa exaustores expirados.
 * @returns Promise concluída após processar expirados.
 */
const processExpiredExaustores = async (): Promise<void> => {
    const now = Date.now();
    const expiredIds = Array.from(exaustorStates.values())
        .filter((state) => state.expiresAt !== null && state.expiresAt <= now)
        .map((state) => state.id);

    for (const id of expiredIds) {
        try {
            await turnOffExaustor(id);
        } catch (error) {
            console.error('[Exaustor] Falha ao desligar expirado:', error);
        }
    }
};

let exaustorServiceLoop: NodeJS.Timeout | null = null;
let exaustorServiceRunning = false;
let exaustorServiceInitialized = false;

/**
 * Inicializa o serviço de exaustores (status e expiração).
 */
export async function startExaustorService(): Promise<void> {
    if (exaustorServiceLoop) return;
    console.log('[ExaustorService] Inicializando serviço de exaustores');

    const run = async () => {
        if (exaustorServiceRunning) return;
        exaustorServiceRunning = true;
        try {
            const modules = listModules();
            if (!exaustorServiceInitialized) {
                for (const { moduleId, host } of modules) {
                    try {
                        await initializeModule(moduleId, host);
                    } catch (error: any) {
                        console.error('[ExaustorService] Falha ao inicializar módulo', { moduleId, error });
                    }
                }
                exaustorServiceInitialized = true;
            } else {
                for (const { moduleId, host } of modules) {
                    const cached = modulesStatusCache.get(moduleId);
                    if (!cached || cached.errorCode) {
                        try {
                            await initializeModule(moduleId, host);
                        } catch (error: any) {
                            console.error('[ExaustorService] Falha ao reinicializar módulo', { moduleId, error });
                        }
                        continue;
                    }

                    await refreshModuleStatus(moduleId, host);
                }
            }
            await processExpiredExaustores();
            console.log('[ExaustorService] Execução do ciclo concluída');
        } finally {
            exaustorServiceRunning = false;
        }
    };

    await run();
    exaustorServiceLoop = setInterval(run, EXAUSTOR_SWEEP_INTERVAL_MS);
    console.log('[ExaustorService] Serviço iniciado com sucesso');
}

/**
 * Atualiza o estado em memória e agenda desligamento se necessário.
 * @param state Estado do exaustor.
 * @param minutes Minutos para desligar.
 */
const setState = (state: ExaustorState, minutes?: number): void => {
    if (minutes && minutes > 0) {
        setExpiry(state, minutes);
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
 * Aguarda o tempo informado em ms.
 * @param ms Tempo em milissegundos.
 */
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

    console.log('[Exaustor] Ligando exaustor', {
        id: normalizedId,
        tower,
        final,
        relay,
        group,
        moduleId,
        minutes: minutes ?? null,
    });
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

    console.log('[Exaustor] Desligando exaustor', {
        id: normalizedId,
        tower,
        relay,
        group,
        pwrModuleId,
        pwrRelay,
    });
    const offResult = await setRelay(pwrHost, pwrRelay);

    clearState(normalizedId);

    const statesToRestore = Array.from(exaustorStates.values())
        .filter((state) => state.tower === tower && state.group === group);

    const restoreResults: Record<string, any> = {};

    let needsDelay = false;
    for (const state of statesToRestore) {
        const moduleHost = resolveModuleHost(state.moduleId);
        const remaining = getRemainingMinutes(state);
        if (remaining && remaining > 5) {
            if (needsDelay) {
                await delay(EXAUSTOR_REARM_DELAY_MS);
            }
            restoreResults[state.id] = await setRelay(moduleHost, state.relay);
            setExpiry(state, remaining);
            needsDelay = true;
        } else {
            restoreResults[state.id] = { skipped: true, remainingMinutes: remaining };
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
    const { tower, final, relay, group, moduleId } = parseApartment(normalized);
    const moduleStatus = modulesStatusCache.get(moduleId) || null;
    const memory = buildMemorySnapshot().find((state) => state.id === normalized) || null;

    return {
        id: normalized,
        tower,
        final,
        group,
        relay,
        moduleId,
        moduleStatus,
        memory,
    };
};

/**
 * Retorna o status de todos os módulos e a memória de acionamentos.
 * @returns Status por módulo e memória serializada.
 */
export const getAllModulesStatus = async (): Promise<{ modules: Record<string, any>; memory: ReturnType<typeof buildMemorySnapshot> }> => {
    const modulesStatus = Array.from(modulesStatusCache.entries()).reduce<Record<string, any>>((acc, [moduleId, data]) => {
        acc[moduleId] = data;
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

/**
 * Retorna o status do processo de memória dos relés.
 * @returns Snapshot do processo e contadores.
 */
export const getExaustorProcessStatus = () => {
    const memory = buildMemorySnapshot();
    return {
        total: memory.length,
        memory,
        generatedAt: new Date().toISOString(),
    };
};
