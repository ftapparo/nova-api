import axios from 'axios';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

/**
 * Torres disponíveis.
 */
type Tower = 'A' | 'B' | 'C';
/**
 * Grupos de finais (1-4 ou 5-8).
 */
type Group = '14' | '58';
type ExhaustCommand = 'ligar' | 'desligar';
type ExhaustProcessStatus = 'iniciando' | 'executado' | 'erro';

/**
 * Mapeamento de módulos para seus respectivos hosts.
 */
const EXHAUST_HOSTS: Record<string, string | undefined> = {
    A_14: process.env.EXHAUST_A_14_HOST,
    A_58: process.env.EXHAUST_A_58_HOST,
    B_14: process.env.EXHAUST_B_14_HOST,
    B_58: process.env.EXHAUST_B_58_HOST,
    C_14: process.env.EXHAUST_C_14_HOST,
    C_58: process.env.EXHAUST_C_58_HOST,
    PWR_14: process.env.EXHAUST_PWR_14_HOST,
    PWR_58: process.env.EXHAUST_PWR_58_HOST,
};

/**
 * Porta dos módulos Tasmota.
 */
const EXHAUST_PORT = Number(process.env.EXHAUST_PORT || 80);
/**
 * Timeout das chamadas HTTP.
 */
const EXHAUST_TIMEOUT_MS = Number(process.env.EXHAUST_TIMEOUT_MS || 30000);
/**
 * Delay entre reativações de relés (ms).
 */
const EXHAUST_REARM_DELAY_MS = 2000;

/**
 * Intervalo de varredura para desligar expirados (ms).
 */
const EXHAUST_SWEEP_INTERVAL_MS = Number(process.env.EXHAUST_SWEEP_INTERVAL_MS || 60000);
const EXHAUST_MEMORY_DIR = path.resolve(process.env.EXHAUST_MEMORY_DIR || path.join(process.cwd(), 'storage', 'exhaust'));
const EXHAUST_MEMORY_FILE = path.resolve(process.env.EXHAUST_MEMORY_FILE || path.join(EXHAUST_MEMORY_DIR, 'memory.json'));

const EXPECTED_PULSE_TIME = 5;
const EXPECTED_RELAY_COUNT = 4;

/**
 * Estado em memória de um exhaust.
 */
type ExhaustState = {
    id: string;
    tower: Tower;
    final: number;
    group: Group;
    relay: number;
    moduleId: string;
    expiresAt: number | null;
    processStatus: ExhaustProcessStatus;
    pendingCommand: ExhaustCommand;
    lastError: string | null;
    updatedAt: number;
    retryCount: number;
};

/**
 * Memória dos exhausts ligados e seus timers.
 */
const exhaustStates = new Map<string, ExhaustState>();

type ExhaustMemoryFile = {
    version: number;
    updatedAt: string;
    states: ExhaustState[];
};

/**
 * Normaliza o ID do apartamento.
 * @param id Identificador do exhaust.
 */
const normalizeApartmentId = (id: string) => id.trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '_');

const ensureExhaustStorage = (): void => {
    fs.mkdirSync(EXHAUST_MEMORY_DIR, { recursive: true });
};

const serializeExhaustMemory = (): ExhaustMemoryFile => ({
    version: 1,
    updatedAt: new Date().toISOString(),
    states: Array.from(exhaustStates.values()),
});

const persistExhaustMemory = (): void => {
    try {
        ensureExhaustStorage();
        const payload = JSON.stringify(serializeExhaustMemory(), null, 2);
        const tempPath = `${EXHAUST_MEMORY_FILE}.tmp`;
        fs.writeFileSync(tempPath, payload, { encoding: 'utf8' });
        fs.renameSync(tempPath, EXHAUST_MEMORY_FILE);
    } catch (error) {
        logger.error(`[ExhaustService] Erro ao persistir memoria: ${String(error)}`);
    }
};

const toExhaustState = (state: Partial<ExhaustState>): ExhaustState | null => {
    if (
        typeof state.id !== 'string'
        || typeof state.tower !== 'string'
        || typeof state.final !== 'number'
        || typeof state.group !== 'string'
        || typeof state.relay !== 'number'
        || typeof state.moduleId !== 'string'
    ) {
        return null;
    }

    const processStatus: ExhaustProcessStatus = state.processStatus === 'iniciando'
        || state.processStatus === 'executado'
        || state.processStatus === 'erro'
        ? state.processStatus
        : 'executado';
    const pendingCommand: ExhaustCommand = state.pendingCommand === 'desligar' ? 'desligar' : 'ligar';

    return {
        id: normalizeApartmentId(state.id),
        tower: state.tower as Tower,
        final: state.final,
        group: state.group as Group,
        relay: state.relay,
        moduleId: state.moduleId,
        expiresAt: typeof state.expiresAt === 'number' ? state.expiresAt : null,
        processStatus,
        pendingCommand,
        lastError: typeof state.lastError === 'string' ? state.lastError : null,
        updatedAt: typeof state.updatedAt === 'number' ? state.updatedAt : Date.now(),
        retryCount: typeof state.retryCount === 'number' ? state.retryCount : 0,
    };
};

const loadExhaustMemory = (): void => {
    try {
        ensureExhaustStorage();
        if (!fs.existsSync(EXHAUST_MEMORY_FILE)) {
            return;
        }

        const raw = fs.readFileSync(EXHAUST_MEMORY_FILE, 'utf8').trim();
        if (!raw) {
            return;
        }

        const parsed = JSON.parse(raw) as ExhaustMemoryFile;
        const states = Array.isArray(parsed?.states) ? parsed.states : [];
        exhaustStates.clear();

        for (const item of states) {
            const hydrated = toExhaustState(item);
            if (!hydrated) continue;
            exhaustStates.set(hydrated.id, hydrated);
        }

        logger.info(`[ExhaustService] Memoria recuperada do arquivo (${exhaustStates.size} itens)`);
    } catch (error) {
        logger.error(`[ExhaustService] Erro ao carregar memoria: ${String(error)}`);
    }
};

/**
 * Resolve o host do módulo.
 * @param moduleId ID do módulo (ex: A_14).
 * @returns Host configurado.
 */
const resolveModuleHost = (moduleId: string): string => {
    const normalized = moduleId.trim().toUpperCase();
    const host = EXHAUST_HOSTS[normalized];
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
    const portPart = EXHAUST_PORT ? `:${EXHAUST_PORT}` : '';
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
    const config = { params: { cmnd }, timeout: EXHAUST_TIMEOUT_MS };
    const response = await axios.get(url, config);
    return response.data;
};

/**
 * Envia comando ao módulo e retorna dados com statusCode.
 * @param host IP/host do módulo.
 * @param cmnd Comando Tasmota.
 * @returns Resposta do módulo com statusCode.
 */
const sendCommandWithStatus = async (host: string, cmnd: string): Promise<{ data: any; statusCode: number }> => {
    const url = buildUrl(host);
    const config = { params: { cmnd }, timeout: EXHAUST_TIMEOUT_MS };
    const response = await axios.get(url, config);
    return { data: response.data, statusCode: response.status };
};

type ModuleStatusCache = {
    status: any;
    pulseTime: any;
    updatedAt: number;
    host: string;
    port: number;
    statusCode: number | null;
    errorCode?: string | null;
    error?: string | null;
};

const createServiceError = (message: string, status: number): Error & { status: number } => {
    const error = new Error(message) as Error & { status: number };
    error.status = status;
    return error;
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
    if (EXHAUST_HOSTS[upper]) {
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
    const response = await axios.get(url, { timeout: EXHAUST_TIMEOUT_MS });
    return response.data;
};

/**
 * Lista todos os módulos configurados com host válido.
 * @returns Lista de módulos com seu host.
 */
const listModules = (): { moduleId: string; host: string }[] => {
    return Object.entries(EXHAUST_HOSTS)
        .filter(([, host]) => Boolean(host))
        .map(([moduleId, host]) => ({ moduleId, host: host as string }));
};

/**
 * Atualiza o cache com os dados coletados do módulo.
 * @param moduleId Identificador do módulo.
 * @param status Status retornado.
 * @param pulseTime PulseTime retornado.
 */
const updateModuleCache = (moduleId: string, status: any, pulseTime: any, host: string, statusCode: number | null): void => {
    modulesStatusCache.set(moduleId, {
        status,
        pulseTime,
        updatedAt: Date.now(),
        host,
        port: EXHAUST_PORT,
        statusCode,
        errorCode: null,
        error: null,
    });
};

/**
 * Extrai statusCode do erro HTTP (se houver).
 * @param error Erro capturado.
 * @returns StatusCode ou null.
 */
const getErrorStatusCode = (error: unknown): number | null => {
    const axiosError = error as { response?: { status?: number } } | null;
    const status = axiosError?.response?.status;
    return typeof status === 'number' ? status : null;
};

/**
 * Atualiza o cache com erro para o módulo.
 * @param moduleId Identificador do módulo.
 * @param errorCode Código do erro.
 * @param error Mensagem do erro.
 */
const updateModuleCacheError = (moduleId: string, errorCode: string, error: unknown): void => {
    const host = EXHAUST_HOSTS[moduleId] ?? null;
    const statusCode = getErrorStatusCode(error);
    modulesStatusCache.set(moduleId, {
        status: null,
        pulseTime: null,
        updatedAt: Date.now(),
        host: host ?? '',
        port: EXHAUST_PORT,
        statusCode,
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
            console.log('[ExhaustService] Corrigindo PulseTime', {
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
    console.log('[ExhaustService] Inicializando módulo', { moduleId, host });

    // 1. Consulta status inicial
    let status: any;
    let statusCode: number | null = null;
    try {
        const statusResponse = await sendCommandWithStatus(host, 'Status');
        status = statusResponse.data;
        statusCode = statusResponse.statusCode;
        console.log('[ExhaustService] Status recebido', { moduleId });
    } catch (error) {
        const errorStatusCode = getErrorStatusCode(error);
        updateModuleCacheError(moduleId, 'STATUS_READ_FAILED', error);
        console.error('[ExhaustService] Falha ao ler Status', { moduleId, statusCode: errorStatusCode, error });
        throw error;
    }

    // 2. Força desligamento de todos os relés
    try {
        await forceModuleOff(host);
        console.log('[ExhaustService] Relés desligados', { moduleId });
    } catch (error) {
        const errorStatusCode = getErrorStatusCode(error);
        updateModuleCacheError(moduleId, 'POWER_OFF_FAILED', error);
        console.error('[ExhaustService] Falha ao desligar relés', { moduleId, statusCode: errorStatusCode, error });
        throw error;
    }

    // 3. Valida PulseTime
    let pulseTime: any;
    try {
        pulseTime = await sendCommand(host, 'PulseTime');
        console.log('[ExhaustService] PulseTime recebido', {
            moduleId,
            pulseTime: JSON.stringify(pulseTime),
        });
    } catch (error) {
        const errorStatusCode = getErrorStatusCode(error);
        updateModuleCacheError(moduleId, 'PULSETIME_READ_FAILED', error);
        console.error('[ExhaustService] Falha ao ler PulseTime', { moduleId, statusCode: errorStatusCode, error });
        throw error;
    }

    try {
        await ensurePulseTime(host, pulseTime);
        console.log('[ExhaustService] PulseTime validado', { moduleId });
    } catch (error) {
        const errorStatusCode = getErrorStatusCode(error);
        updateModuleCacheError(moduleId, 'PULSETIME_CONFIG_FAILED', error);
        console.error('[ExhaustService] Falha ao configurar PulseTime', { moduleId, statusCode: errorStatusCode, error });
        throw error;
    }

    // 4. Corrige PulseTime se necessário
    let refreshedPulseTime: any;
    try {
        refreshedPulseTime = await sendCommand(host, 'PulseTime');
        console.log('[ExhaustService] PulseTime final', {
            moduleId,
            pulseTime: JSON.stringify(refreshedPulseTime),
        });
    } catch (error) {
        const errorStatusCode = getErrorStatusCode(error);
        updateModuleCacheError(moduleId, 'PULSETIME_VERIFY_FAILED', error);
        console.error('[ExhaustService] Falha ao verificar PulseTime', { moduleId, statusCode: errorStatusCode, error });
        throw error;
    }

    const finalValues = Array.isArray(refreshedPulseTime?.PulseTime?.Set)
        ? refreshedPulseTime.PulseTime.Set
        : [];
    const hasMismatch = Array.from({ length: EXPECTED_RELAY_COUNT }).some((_, index) => finalValues[index] !== EXPECTED_PULSE_TIME);
    if (hasMismatch) {
        const error = 'PulseTime final diferente do esperado';
        updateModuleCacheError(moduleId, 'PULSETIME_VERIFY_FAILED', error);
        console.error('[ExhaustService] PulseTime final inválido', { moduleId, finalValues });
        throw new Error(error);
    }

    // 5. Atualiza cache de status
    updateModuleCache(moduleId, status, refreshedPulseTime, host, statusCode);
    console.log('[ExhaustService] Módulo inicializado', { moduleId });
};

/**
 * Atualiza o status e pulsetime de um módulo.
 * @param moduleId Identificador do módulo.
 * @param host Host do módulo.
 */
const refreshModuleStatus = async (moduleId: string, host: string): Promise<void> => {
    try {
        const [statusResponse, pulseTimeResponse] = await Promise.all([
            sendCommandWithStatus(host, 'Status'),
            sendCommandWithStatus(host, 'PulseTime'),
        ]);

        const status = statusResponse.data;
        const pulseTime = pulseTimeResponse.data;

        if (!status) {
            updateModuleCacheError(moduleId, 'STATUS_READ_FAILED', 'Status vazio');
            return;
        }

        modulesStatusCache.set(moduleId, {
            status,
            pulseTime,
            updatedAt: Date.now(),
            host,
            port: EXHAUST_PORT,
            statusCode: statusResponse.statusCode,
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
const setExpiry = (state: ExhaustState, minutes: number): void => {
    const timeoutMs = Math.round(minutes * 60 * 1000);
    state.expiresAt = Date.now() + timeoutMs;
};

/**
 * Processa exaustores expirados.
 * @returns Promise concluída após processar expirados.
 */
const processExpiredExhausts = async (): Promise<void> => {
    const now = Date.now();
    const expiredIds = Array.from(exhaustStates.values())
        .filter((state) => state.expiresAt !== null && state.expiresAt <= now && state.processStatus === 'executado')
        .map((state) => state.id);

    for (const id of expiredIds) {
        try {
            await turnOffExhaust(id);
        } catch (error) {
            logger.error(`[Exhaust] Falha ao desligar expirado ${id}: ${String(error)}`);
        }
    }
};

let exhaustServiceLoop: NodeJS.Timeout | null = null;
let exhaustServiceRunning = false;
let exhaustServiceInitialized = false;

/**
 * Inicializa o serviço de exaustores  (status e expiração).
 */
export async function startExhaustService(): Promise<void> {
    if (exhaustServiceLoop) return;
    loadExhaustMemory();
    logger.info('[ExhaustService] Inicializando servico de exaustores');

    const run = async () => {
        if (exhaustServiceRunning) return;
        exhaustServiceRunning = true;
        try {
            const modules = listModules();
            if (!exhaustServiceInitialized) {
                for (const { moduleId, host } of modules) {
                    try {
                        await initializeModule(moduleId, host);
                    } catch (error: any) {
                        logger.error(`[ExhaustService] Falha ao inicializar modulo ${moduleId}: ${String(error)}`);
                    }
                }
                exhaustServiceInitialized = true;
            } else {
                for (const { moduleId, host } of modules) {
                    const cached = modulesStatusCache.get(moduleId);
                    if (!cached || cached.errorCode) {
                        try {
                            await initializeModule(moduleId, host);
                        } catch (error: any) {
                            logger.error(`[ExhaustService] Falha ao reinicializar modulo ${moduleId}: ${String(error)}`);
                        }
                        continue;
                    }

                    await refreshModuleStatus(moduleId, host);
                }
            }
            await retryErroredCommands();
            await processExpiredExhausts();
            logger.debug('[ExhaustService] Execucao do ciclo concluida');
        } finally {
            exhaustServiceRunning = false;
        }
    };

    await run();
    exhaustServiceLoop = setInterval(run, EXHAUST_SWEEP_INTERVAL_MS);
    logger.info('[ExhaustService] Servico iniciado com sucesso');
}

/**
 * Atualiza o estado em memória e agenda desligamento se necessário.
 * @param state Estado do exaustor.
 * @param minutes Minutos para desligar.
 */
const setState = (state: ExhaustState, minutes?: number): void => {
    if (minutes && minutes > 0) {
        setExpiry(state, minutes);
    } else {
        state.expiresAt = null;
    }

    state.updatedAt = Date.now();
    exhaustStates.set(state.id, state);
    persistExhaustMemory();
};

/**
 * Remove o estado em memória.
 * @param id Identificador do exaustor.
 */
const clearState = (id: string): void => {
    const normalizedId = normalizeApartmentId(id);
    exhaustStates.delete(normalizedId);
    persistExhaustMemory();
};

const updateStateProcess = (id: string, processStatus: ExhaustProcessStatus, pendingCommand: ExhaustCommand, error?: unknown): void => {
    const normalizedId = normalizeApartmentId(id);
    const current = exhaustStates.get(normalizedId);
    if (!current) return;

    current.processStatus = processStatus;
    current.pendingCommand = pendingCommand;
    current.updatedAt = Date.now();
    if (processStatus === 'erro') {
        current.retryCount += 1;
        current.lastError = error ? String(error) : 'Erro desconhecido';
    } else {
        current.lastError = null;
    }

    exhaustStates.set(normalizedId, current);
    persistExhaustMemory();
};

/**
 * Calcula minutos restantes para desligamento.
 * @param state Estado do exaustor.
 * @returns Minutos restantes ou null.
 */
const getRemainingMinutes = (state: ExhaustState): number | null => {
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
    return Array.from(exhaustStates.values()).map((state) => ({
        id: state.id,
        tower: state.tower,
        final: state.final,
        group: state.group,
        relay: state.relay,
        moduleId: state.moduleId,
        expiresAt: state.expiresAt,
        processStatus: state.processStatus,
        pendingCommand: state.pendingCommand,
        lastError: state.lastError,
        retryCount: state.retryCount,
        updatedAt: new Date(state.updatedAt).toISOString(),
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
export const turnOnExhaust = async (id: string, minutes?: number): Promise<any> => {
    const normalizedId = normalizeApartmentId(id);
    const { tower, final, relay, group, moduleId } = parseApartment(normalizedId);
    const host = resolveModuleHost(moduleId);
    const cachedModuleStatus = modulesStatusCache.get(moduleId);

    if (!cachedModuleStatus) {
        throw createServiceError(`Status do módulo ${moduleId} não encontrado em cache.`, 503);
    }

    const isOnline = cachedModuleStatus.statusCode === 200 && !cachedModuleStatus.error;
    if (!isOnline) {
        throw createServiceError(`Módulo ${moduleId} está offline.`, 503);
    }

    logger.info(`[Exhaust] Ligando exaustor ${normalizedId}`);

    setState({
        id: normalizedId,
        tower,
        final,
        relay,
        group,
        moduleId,
        expiresAt: null,
        processStatus: 'iniciando',
        pendingCommand: 'ligar',
        lastError: null,
        updatedAt: Date.now(),
        retryCount: 0,
    }, minutes);

    try {
        const result = await setRelay(host, relay);
        updateStateProcess(normalizedId, 'executado', 'ligar');
        return result;
    } catch (error) {
        updateStateProcess(normalizedId, 'erro', 'ligar', error);
        throw error;
    }
};

const restoreGroupStates = async (tower: Tower, group: Group): Promise<Record<string, any>> => {
    const statesToRestore = Array.from(exhaustStates.values())
        .filter((state) => state.tower === tower && state.group === group && state.processStatus === 'executado');
    const restoreResults: Record<string, any> = {};

    let needsDelay = false;
    for (const state of statesToRestore) {
        const moduleHost = resolveModuleHost(state.moduleId);
        const remaining = getRemainingMinutes(state);
        if (remaining && remaining > 5) {
            if (needsDelay) {
                await delay(EXHAUST_REARM_DELAY_MS);
            }
            restoreResults[state.id] = await setRelay(moduleHost, state.relay);
            setExpiry(state, remaining);
            state.updatedAt = Date.now();
            exhaustStates.set(state.id, state);
            persistExhaustMemory();
            needsDelay = true;
        } else {
            restoreResults[state.id] = { skipped: true, remainingMinutes: remaining };
        }
    }

    return restoreResults;
};

const executeTurnOff = async (normalizedId: string): Promise<any> => {
    const { tower, group } = parseApartment(normalizedId);
    const pwrModuleId = `PWR_${group}`;
    const pwrHost = resolveModuleHost(pwrModuleId);
    const pwrRelay = getPwrRelayForTower(tower);

    logger.info(`[Exhaust] Desligando exaustor ${normalizedId}`);
    const offResult = await setRelay(pwrHost, pwrRelay);
    const restoreResults = await restoreGroupStates(tower, group);

    return { offResult, restoreResults };
};

/**
 * Desliga um exaustor via módulo PWR e religa os demais do grupo.
 * @param id Identificador do exaustor.
 * @returns Resultado do desligamento e reativações.
 */
export const turnOffExhaust = async (id: string): Promise<any> => {
    const normalizedId = normalizeApartmentId(id);
    const metadata = parseApartment(normalizedId);
    const existing = exhaustStates.get(normalizedId);

    if (!existing) {
        setState({
            id: normalizedId,
            tower: metadata.tower,
            final: metadata.final,
            relay: metadata.relay,
            group: metadata.group,
            moduleId: metadata.moduleId,
            expiresAt: null,
            processStatus: 'iniciando',
            pendingCommand: 'desligar',
            lastError: null,
            updatedAt: Date.now(),
            retryCount: 0,
        });
    } else {
        updateStateProcess(normalizedId, 'iniciando', 'desligar');
    }

    try {
        const result = await executeTurnOff(normalizedId);
        clearState(normalizedId);
        return result;
    } catch (error) {
        updateStateProcess(normalizedId, 'erro', 'desligar', error);
        throw error;
    }
};

const retryErroredCommands = async (): Promise<void> => {
    const statesWithError = Array.from(exhaustStates.values()).filter((state) => state.processStatus === 'erro');

    for (const state of statesWithError) {
        try {
            if (state.pendingCommand === 'ligar') {
                updateStateProcess(state.id, 'iniciando', 'ligar');
                const moduleHost = resolveModuleHost(state.moduleId);
                await setRelay(moduleHost, state.relay);
                updateStateProcess(state.id, 'executado', 'ligar');
                logger.info(`[ExhaustService] Retry de ligar executado com sucesso (${state.id})`);
                continue;
            }

            updateStateProcess(state.id, 'iniciando', 'desligar');
            await executeTurnOff(state.id);
            clearState(state.id);
            logger.info(`[ExhaustService] Retry de desligar executado com sucesso (${state.id})`);
        } catch (error) {
            updateStateProcess(state.id, 'erro', state.pendingCommand, error);
            logger.error(`[ExhaustService] Retry falhou para ${state.id}: ${String(error)}`);
        }
    }
};

/**
 * Consulta status do exaustor ou do módulo.
 * @param id Identificador do exaustor (A1) ou módulo (A_14/PWR_14).
 * @returns Status retornado pelo módulo.
 */
export const getExhaustStatus = async (id: string): Promise<any> => {
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
    await refreshAllModulesStatus();
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
export const configureExhaustModule = async (module: string, command: string): Promise<any> => {
    const host = resolveHostByModule(module);
    return sendRawCommand(host, command);
};

/**
 * Retorna o estado em memória de um exaustor.
 * @param id Identificador do exaustor.
 * @returns Estado em memória ou null.
 */
export const getExhaustMemory = (id: string): ExhaustState | null => {
    const normalizedId = normalizeApartmentId(id);
    return exhaustStates.get(normalizedId) ?? null;
};

/**
 * Retorna o status do processo de memória dos relés.
 * @returns Snapshot do processo e contadores.
 */
export const getExhaustProcessStatus = () => {
    const memory = buildMemorySnapshot();
    return {
        total: memory.length,
        memory,
        generatedAt: new Date().toISOString(),
    };
};
