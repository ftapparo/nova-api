import fs from 'fs';
import path from 'path';

export type CommandLogEntry = {
    id: string;
    timestamp: string;
    method: string;
    path: string;
    command: string;
    status: number;
    actor: string;
    ip: string | null;
};

const LOG_BASE_DIR = process.env.LOG_DIR || '/app/logs';
const COMMAND_LOG_DIR = path.resolve(process.env.COMMAND_LOG_DIR || path.join(LOG_BASE_DIR, 'api-commands'));
const RETENTION_DAYS = Number(process.env.COMMAND_LOG_RETENTION_DAYS || 7);

const toDateKey = (date = new Date()): string => date.toISOString().slice(0, 10);

const ensureDir = (): void => {
    fs.mkdirSync(COMMAND_LOG_DIR, { recursive: true });
};

const getLogPathByDate = (dateKey: string): string => path.join(COMMAND_LOG_DIR, `${dateKey}.jsonl`);

const pruneOldFiles = (): void => {
    ensureDir();
    const entries = fs.readdirSync(COMMAND_LOG_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a));

    const keep = Math.max(1, RETENTION_DAYS);
    for (const fileName of entries.slice(keep)) {
        fs.unlinkSync(path.join(COMMAND_LOG_DIR, fileName));
    }
};

const safeParseEntry = (line: string): CommandLogEntry | null => {
    try {
        const parsed = JSON.parse(line) as CommandLogEntry;
        if (!parsed || typeof parsed !== 'object') return null;
        if (typeof parsed.timestamp !== 'string' || typeof parsed.command !== 'string') return null;
        return parsed;
    } catch {
        return null;
    }
};

export const appendCommandLog = (entry: CommandLogEntry): void => {
    try {
        ensureDir();
        pruneOldFiles();
        const dateKey = toDateKey(new Date(entry.timestamp));
        const filePath = getLogPathByDate(dateKey);
        fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
    } catch {
        // Sem throw para nao impactar execucao de comandos da API.
    }
};

export const listCommandLogs = (limit = 20): CommandLogEntry[] => {
    ensureDir();
    pruneOldFiles();

    const cappedLimit = Math.min(Math.max(1, Math.trunc(limit || 20)), 200);
    const files = fs.readdirSync(COMMAND_LOG_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a));

    const collected: CommandLogEntry[] = [];

    for (const fileName of files) {
        const filePath = path.join(COMMAND_LOG_DIR, fileName);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/).filter(Boolean);

        for (let index = lines.length - 1; index >= 0; index -= 1) {
            const entry = safeParseEntry(lines[index]);
            if (!entry) continue;
            collected.push(entry);
            if (collected.length >= cappedLimit) {
                return collected.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
            }
        }
    }

    return collected.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
};
