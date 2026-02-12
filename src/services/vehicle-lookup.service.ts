import axios from 'axios';
import fs from 'fs';
import puppeteer, { Browser, Page } from 'puppeteer';

type LookupData = {
    brand: string | null;
    model: string | null;
    color: string | null;
};

type ProviderName = 'API1' | 'API2' | 'API3';
type Mechanism = 'http' | 'scraping' | 'paid';

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
    name: ProviderName;
    url: string | null;
};

const DEFAULT_TIMEOUT_MS = Number(process.env.VEHICLE_LOOKUP_TIMEOUT_MS || '5000');
const DEFAULT_BROWSER_TIMEOUT_MS = 15000;

const parseBooleanEnv = (value: string | undefined, defaultValue: boolean): boolean => {
    if (value === undefined) return defaultValue;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return defaultValue;
};

type LookupRuntimeConfig = {
    timeoutMs: number;
    providers: ProviderConfig[];
    scrapingApi1Enabled: boolean;
    scrapingApi2Enabled: boolean;
    wdApiEnabled: boolean;
    puppeteerHeadless: boolean;
    puppeteerExecutablePath: string | undefined;
    wdApiUrlTemplate: string | null;
    wdApiToken: string | null;
};

const CHROMIUM_EXECUTABLE_CANDIDATES = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
];

const getRuntimeConfig = (): LookupRuntimeConfig => {
    const timeoutCandidate = Number(process.env.VEHICLE_LOOKUP_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS));
    const timeoutMs = Number.isFinite(timeoutCandidate) && timeoutCandidate > 0 ? timeoutCandidate : 5000;

    const scrapingEnabled = parseBooleanEnv(process.env.VEHICLE_LOOKUP_SCRAPING_ENABLED, true);

    return {
        timeoutMs,
        providers: [
            { name: 'API1', url: process.env.VEHICLE_LOOKUP_PROVIDER_1_URL?.trim() || null },
            { name: 'API2', url: process.env.VEHICLE_LOOKUP_PROVIDER_2_URL?.trim() || null },
            { name: 'API3', url: process.env.VEHICLE_LOOKUP_PROVIDER_3_URL?.trim() || null },
        ],
        scrapingApi1Enabled: scrapingEnabled && parseBooleanEnv(process.env.VEHICLE_LOOKUP_SCRAPING_API1_ENABLED, true),
        scrapingApi2Enabled: scrapingEnabled && parseBooleanEnv(process.env.VEHICLE_LOOKUP_SCRAPING_API2_ENABLED, true),
        wdApiEnabled: parseBooleanEnv(process.env.VEHICLE_LOOKUP_WDAPI_ENABLED, false),
        puppeteerHeadless: parseBooleanEnv(process.env.PUPPETEER_HEADLESS, true),
        puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || undefined,
        wdApiUrlTemplate: process.env.VEHICLE_LOOKUP_WDAPI_URL_TEMPLATE?.trim() || null,
        wdApiToken: process.env.VEHICLE_LOOKUP_WDAPI_TOKEN?.trim() || null,
    };
};

const resolvePuppeteerExecutablePath = (configuredPath?: string): string | undefined => {
    if (configuredPath && fs.existsSync(configuredPath)) {
        return configuredPath;
    }

    for (const candidate of CHROMIUM_EXECUTABLE_CANDIDATES) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return undefined;
};

const sanitizeScrapingErrorMessage = (error: unknown): string => {
    const rawMessage = String((error as { message?: unknown })?.message ?? '');
    const normalized = rawMessage.toLowerCase();

    if (
        normalized.includes('could not find chrome')
        || normalized.includes('failed to launch the browser process')
        || normalized.includes('failed to launch browser')
    ) {
        return 'Scraping indisponivel: Chrome/Chromium nao encontrado no ambiente.';
    }

    return rawMessage || 'Erro ao consultar scraping.';
};

const normalizeText = (value: unknown): string | null => {
    const text = String(value ?? '').trim();
    return text ? text.toUpperCase() : null;
};

const resolveProviderUrl = (template: string, plate: string): string => {
    if (template.includes('{plate}')) {
        return template.split('{plate}').join(encodeURIComponent(plate));
    }

    const separator = template.includes('?') ? '&' : '?';
    return `${template}${separator}plate=${encodeURIComponent(plate)}`;
};

const resolveApi3HttpTemplate = (template: string, token: string | null): { ok: true; template: string } | { ok: false; message: string } => {
    if (!template.includes('{token}')) {
        return { ok: true, template };
    }

    if (!token) {
        return { ok: false, message: 'API3 HTTP configurada com {token}, mas VEHICLE_LOOKUP_WDAPI_TOKEN nao foi informado.' };
    }

    return {
        ok: true,
        template: template.split('{token}').join(encodeURIComponent(token)),
    };
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

const hasAnyLookupData = (data: LookupData | null): boolean => Boolean(data?.brand || data?.model || data?.color);

const logAttempt = (params: {
    source: ProviderName;
    mechanism: Mechanism;
    success: boolean;
    durationMs: number;
    message: string;
}) => {
    const status = params.success ? 'success' : 'fail';
    console.log(
        `[VehicleLookup] source=${params.source} mechanism=${params.mechanism} status=${status} durationMs=${params.durationMs} message="${params.message}"`
    );
};

const buildSourceResult = (
    source: ProviderName,
    durationMs: number,
    message: string,
    data: LookupData | null
): VehicleLookupSourceResult => ({
    name: source,
    success: hasAnyLookupData(data),
    durationMs,
    message,
    data: hasAnyLookupData(data) ? data : null,
});

const requestByUrlTemplate = async (
    source: ProviderName,
    mechanism: Mechanism,
    template: string,
    plate: string,
    timeoutMs: number
): Promise<VehicleLookupSourceResult> => {
    const url = resolveProviderUrl(template, plate);
    return requestByAbsoluteUrl(source, mechanism, url, timeoutMs);
};

const requestByAbsoluteUrl = async (
    source: ProviderName,
    mechanism: Mechanism,
    url: string,
    timeoutMs: number
): Promise<VehicleLookupSourceResult> => {
    const startedAt = Date.now();

    try {
        const response = await axios.get(url, {
            timeout: timeoutMs,
            validateStatus: () => true,
        });
        const durationMs = Date.now() - startedAt;

        if (response.status < 200 || response.status >= 300) {
            const message = `HTTP ${response.status}`;
            logAttempt({ source, mechanism, success: false, durationMs, message });
            return buildSourceResult(source, durationMs, message, null);
        }

        const data = extractLookupData(response.data);
        const success = hasAnyLookupData(data);
        const message = success ? 'Consulta realizada com sucesso.' : 'Consulta sem dados de veiculo.';
        logAttempt({ source, mechanism, success, durationMs, message });
        return buildSourceResult(source, durationMs, message, data);
    } catch (error: any) {
        const durationMs = Date.now() - startedAt;
        const message = error?.message ?? 'Erro ao consultar provider.';
        logAttempt({ source, mechanism, success: false, durationMs, message });
        return buildSourceResult(source, durationMs, message, null);
    }
};

const launchBrowser = async (): Promise<{ browser: Browser; page: Page }> => {
    const config = getRuntimeConfig();
    const executablePath = resolvePuppeteerExecutablePath(config.puppeteerExecutablePath);
    if (!executablePath) {
        throw new Error('Scraping indisponivel: Chrome/Chromium nao encontrado no ambiente.');
    }

    const browser = await puppeteer.launch({
        headless: config.puppeteerHeadless,
        executablePath,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
        ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 768 });

    return { browser, page };
};

const scrapeTableBySelectors = async (
    page: Page,
    selectors: { brand: string; model: string; color: string }
): Promise<LookupData> => (
    await page.evaluate((currentSelectors) => {
        const getValue = (selector: string): string | null => {
            const text = document.querySelector(selector)?.textContent?.trim();
            return text ? text : null;
        };

        return {
            brand: getValue(currentSelectors.brand),
            model: getValue(currentSelectors.model),
            color: getValue(currentSelectors.color),
        };
    }, selectors)
);

const requestScrapingProvider = async (
    source: ProviderName,
    urlTemplate: string | null,
    selectors: { brand: string; model: string; color: string },
    plate: string,
    timeoutMs: number
): Promise<VehicleLookupSourceResult> => {
    const startedAt = Date.now();
    let browser: Browser | null = null;

    if (!urlTemplate) {
        const message = `${source} scraping URL nao configurada.`;
        logAttempt({ source, mechanism: 'scraping', success: false, durationMs: 0, message });
        return {
            name: source,
            success: false,
            durationMs: 0,
            message,
            data: null,
        };
    }

    const url = resolveProviderUrl(urlTemplate, plate);

    try {
        const launched = await launchBrowser();
        browser = launched.browser;
        const page = launched.page;

        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: Math.max(timeoutMs, DEFAULT_BROWSER_TIMEOUT_MS),
        });

        const scrapedData = await scrapeTableBySelectors(page, selectors);
        const data: LookupData = {
            brand: normalizeText(scrapedData.brand),
            model: normalizeText(scrapedData.model),
            color: normalizeText(scrapedData.color),
        };

        const durationMs = Date.now() - startedAt;
        const success = hasAnyLookupData(data);
        const message = success
            ? 'Consulta scraping realizada com sucesso.'
            : 'Consulta scraping sem dados de veiculo.';
        logAttempt({ source, mechanism: 'scraping', success, durationMs, message });
        return buildSourceResult(source, durationMs, message, data);
    } catch (error: any) {
        const durationMs = Date.now() - startedAt;
        const message = sanitizeScrapingErrorMessage(error);
        logAttempt({ source, mechanism: 'scraping', success: false, durationMs, message });
        return buildSourceResult(source, durationMs, message, null);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

const resolveWdApiUrl = (plate: string, config: LookupRuntimeConfig): string | null => {
    const template = config.wdApiUrlTemplate;
    if (!template) return null;

    if (template.includes('{token}') && !config.wdApiToken) {
        return null;
    }

    let resolved = template;
    if (resolved.includes('{plate}')) {
        resolved = resolved.split('{plate}').join(encodeURIComponent(plate));
    } else {
        const separator = resolved.includes('?') ? '&' : '?';
        resolved = `${resolved}${separator}plate=${encodeURIComponent(plate)}`;
    }

    if (resolved.includes('{token}')) {
        resolved = resolved.split('{token}').join(encodeURIComponent(config.wdApiToken as string));
    } else if (config.wdApiToken) {
        const separator = resolved.includes('?') ? '&' : '?';
        resolved = `${resolved}${separator}token=${encodeURIComponent(config.wdApiToken)}`;
    }

    return resolved;
};

const requestWdApiProvider = async (
    source: ProviderName,
    plate: string,
    config: LookupRuntimeConfig,
    timeoutMs: number
): Promise<VehicleLookupSourceResult> => {
    const url = resolveWdApiUrl(plate, config);
    if (!url) {
        const message = config.wdApiToken
            ? 'WDAPI habilitada, mas URL/template nao configurada corretamente.'
            : 'WDAPI habilitada, mas VEHICLE_LOOKUP_WDAPI_TOKEN nao configurado.';
        logAttempt({
            source,
            mechanism: 'paid',
            success: false,
            durationMs: 0,
            message,
        });
        return {
            name: source,
            success: false,
            durationMs: 0,
            message,
            data: null,
        };
    }

    return requestByAbsoluteUrl(source, 'paid', url, timeoutMs);
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

const runSource = async (
    provider: ProviderConfig,
    config: LookupRuntimeConfig,
    plate: string,
    timeoutMs: number
): Promise<VehicleLookupSourceResult> => {
    const sourceStartedAt = Date.now();
    const attempts: VehicleLookupSourceResult[] = [];
    const shouldTryWdApiFallback = provider.name === 'API3' && config.wdApiEnabled;
    const sourceUrlTemplate = provider.url;

    if (provider.url) {
        if (provider.name === 'API3') {
            const resolvedApi3 = resolveApi3HttpTemplate(provider.url, config.wdApiToken);
            if (!resolvedApi3.ok) {
                logAttempt({
                    source: provider.name,
                    mechanism: 'http',
                    success: false,
                    durationMs: 0,
                    message: resolvedApi3.message,
                });
                attempts.push({
                    name: provider.name,
                    success: false,
                    durationMs: 0,
                    message: resolvedApi3.message,
                    data: null,
                });
            } else {
                attempts.push(await requestByUrlTemplate(provider.name, 'http', resolvedApi3.template, plate, timeoutMs));
            }
        } else {
            attempts.push(await requestByUrlTemplate(provider.name, 'http', provider.url, plate, timeoutMs));
        }
    } else {
        const missingUrlMessage = provider.name === 'API3' && !shouldTryWdApiFallback
            ? 'API3 sem URL HTTP configurada e WDAPI desabilitada.'
            : 'Provider URL nao configurada.';
        logAttempt({
            source: provider.name,
            mechanism: 'http',
            success: false,
            durationMs: 0,
            message: missingUrlMessage,
        });
        attempts.push({
            name: provider.name,
            success: false,
            durationMs: 0,
            message: missingUrlMessage,
            data: null,
        });
    }

    const httpSuccess = attempts[0]?.success === true;
    if (httpSuccess) {
        const first = attempts[0];
        return {
            ...first,
            durationMs: Date.now() - sourceStartedAt,
        };
    }

    if (provider.name === 'API1' && config.scrapingApi1Enabled) {
        attempts.push(await requestScrapingProvider(
            provider.name,
            sourceUrlTemplate,
            {
                brand: 'table.fipeTablePriceDetail tr:nth-child(1) td:nth-child(2)',
                model: 'table.fipeTablePriceDetail tr:nth-child(2) td:nth-child(2)',
                color: 'table.fipeTablePriceDetail tr:nth-child(6) td:nth-child(2)',
            },
            plate,
            timeoutMs
        ));
    }

    if (provider.name === 'API2' && config.scrapingApi2Enabled) {
        attempts.push(await requestScrapingProvider(
            provider.name,
            sourceUrlTemplate,
            {
                brand: 'table.fipeTablePriceDetail tr:nth-child(1) td:nth-child(2)',
                model: 'table.fipeTablePriceDetail tr:nth-child(3) td:nth-child(2)',
                color: 'table.fipeTablePriceDetail tr:nth-child(7) td:nth-child(2)',
            },
            plate,
            timeoutMs
        ));
    }

    if (provider.name === 'API3' && shouldTryWdApiFallback) {
        attempts.push(await requestWdApiProvider(provider.name, plate, config, timeoutMs));
    }

    const successAttempt = attempts.find((attempt) => attempt.success);
    const finalAttempt = successAttempt ?? attempts[attempts.length - 1];

    return {
        name: provider.name,
        success: finalAttempt?.success ?? false,
        durationMs: Date.now() - sourceStartedAt,
        message: finalAttempt?.message ?? 'Nenhuma tentativa habilitada para o provider.',
        data: finalAttempt?.data ?? null,
    };
};

export const lookupVehicleExternalSources = async (plate: string): Promise<VehicleLookupResult> => {
    const sources: VehicleLookupSourceResult[] = [];
    const config = getRuntimeConfig();
    const timeoutMs = config.timeoutMs;

    for (const provider of config.providers) {
        // Priority is provider order.
        // eslint-disable-next-line no-await-in-loop
        const sourceResult = await runSource(provider, config, plate, timeoutMs);
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
