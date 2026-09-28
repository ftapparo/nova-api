import { z } from 'zod';

// Schemas Zod espelhando os tipos de src/types/cie.ts e src/types/state.ts.
// Mantidos separados do domínio (core/) de propósito: v3 é a única
// camada que precisa validar/documentar formato via Zod.

export const nomeModeloSchema = z.object({
    endereco: z.number(),
    nome: z.string(),
    modelo: z.string(),
});

export const macSchema = z.object({ mac: z.string() });

export const dataHoraSchema = z.object({
    timestamp: z.number(),
    utc: z.string(),
    local: z.string(),
});

export const statusSchema = z.object({
    status: z.object({
        alarme: z.number(),
        falha: z.number(),
        supervisao: z.number(),
        bloqueio: z.number(),
        regrasTemporizando: z.number(),
    }),
    leds: z.record(z.string(), z.boolean()),
});

export const cieStateSnapshotSchema = z.object({
    connected: z.boolean(),
    restartingUntil: z.number().nullable(),
    nomeModelo: nomeModeloSchema.nullable(),
    mac: macSchema.nullable(),
    info: z.record(z.string(), z.number()).nullable(),
    dataHora: dataHoraSchema.nullable(),
    status: statusSchema.nullable(),
    lastUpdated: z.number().nullable(),
    lastError: z.string().nullable(),
    reconnecting: z.boolean(),
    reconnectAttempt: z.number(),
});

export const panelDataSchema = z.object({
    online: z.boolean(),
    connected: z.boolean(),
    restarting: z.boolean(),
    restartingUntil: z.number().nullable(),
    reconnecting: z.boolean(),
    reconnectAttempt: z.number(),
    lastError: z.string().nullable(),
    lastUpdated: z.number().nullable(),
    central: z.object({
        ip: z.string().nullable(),
        endereco: z.number(),
        nome: z.string().nullable(),
        modelo: z.string().nullable(),
        mac: z.string().nullable(),
    }),
    dataHora: dataHoraSchema.nullable(),
    counters: statusSchema.shape.status.nullable(),
    leds: z.record(z.string(), z.boolean()).nullable(),
    latestFailureEvent: z.unknown().nullable(),
    latestAlarmEvent: z.unknown().nullable(),
});

const deviceClassificationSchema = z.object({
    typeCode: z.number().nullable(),
    subtypeCode: z.number().nullable(),
    typeLabel: z.string().nullable(),
    subtypeLabel: z.string().nullable(),
    resolvedLabel: z.string().nullable(),
    source: z.enum(['codes', 'name', 'none']),
});

export const normalizedCieLogSchema = z.object({
    key: z.string(),
    type: z.enum(['alarme', 'falha', 'supervisao', 'operacao', 'bloqueio']),
    id: z.number(),
    zone: z.number().nullable(),
    address: z.number().nullable(),
    loop: z.number().nullable(),
    deviceName: z.string().nullable(),
    zoneName: z.string().nullable(),
    deviceTypeCode: z.number().nullable(),
    deviceTypeLabel: z.string().nullable(),
    deviceClassification: deviceClassificationSchema.nullable(),
    eventType: z.number().nullable(),
    blocked: z.boolean().nullable(),
    occurredAt: z.string(),
    raw: z.unknown(),
    createdAt: z.number(),
});

export const alarmActiveSnapshotSchema = z.object({
    isTriggered: z.boolean(),
    counters: z.object({
        alarme: z.number(),
        falha: z.number(),
        supervisao: z.number(),
        bloqueio: z.number(),
    }),
    latestAlarmLogs: z.array(normalizedCieLogSchema),
});

export const logsListDataSchema = z.object({
    type: z.string(),
    limit: z.number(),
    cursor: z.string().nullable(),
    nextCursor: z.string().nullable(),
    items: z.array(normalizedCieLogSchema),
});

const laçoCountersFields = {
    saidaLaco0: z.number(),
    saidaLaco1: z.number(),
    saidaLaco2: z.number(),
    sireneLaco0: z.number(),
    sireneLaco1: z.number(),
    sireneLaco2: z.number(),
    atuadorLaco0: z.number(),
    atuadorLaco1: z.number(),
    atuadorLaco2: z.number(),
};

export const blockCountersSchema = z.object({
    dispositivo: z.number(),
    sirene: z.number(),
    saida: z.number(),
    atuador: z.number(),
    regra: z.number(),
    zona: z.number(),
    laco: z.number(),
    dispositivoLaco0: z.number(),
    dispositivoLaco1: z.number(),
    dispositivoLaco2: z.number(),
    ...laçoCountersFields,
});

export const outputCountersSchema = z.object({
    ...laçoCountersFields,
    saida: z.number(),
    sirene: z.number(),
    atuador: z.number(),
});

export const logTypeQuerySchema = z.enum(['alarme', 'falha', 'supervisao', 'operacao', 'bloqueio']);
