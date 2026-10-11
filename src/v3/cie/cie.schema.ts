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


const deviceClassificationSchema = z.object({
    typeCode: z.number().nullable(),
    subtypeCode: z.number().nullable(),
    typeLabel: z.string().nullable(),
    subtypeLabel: z.string().nullable(),
    resolvedLabel: z.string().nullable(),
    source: z.enum(['codes', 'name', 'none']),
});

const logTypeValues = ['alarme', 'falha', 'supervisao', 'operacao', 'bloqueio'] as const;
export const ACTIVE_TYPE_VALUES = ['alarme', 'falha', 'supervisao', 'bloqueio'] as const;
export const EVENT_KIND_VALUES = ['ativacao', 'restauracao', 'estado', 'informativo'] as const;
const severitySchema = z.enum(['critical', 'warning', 'info', 'ok']);

// Evento já interpretado pelo nova-cie (tabela de códigos da central):
// clientes exibem label/display, nunca interpretam eventType.
export const eventInfoSchema = z.object({
    category: z.enum(logTypeValues),
    code: z.number().nullable(),
    label: z.string(),
    kind: z.enum(EVENT_KIND_VALUES),
    severity: severitySchema,
});

export const placeSchema = z.object({
    tower: z.string().nullable(),
    towerLabel: z.string().nullable(),
    floor: z.number().nullable(),
    floorLabel: z.string().nullable(),
    position: z.string().nullable(),
    positionLabel: z.string().nullable(),
    area: z.string().nullable(),
    areaDetail: z.string().nullable(),
});

export const ruleRefSchema = z.object({ id: z.number(), name: z.string().nullable() });

export const logDisplaySchema = z.object({
    title: z.string(),
    device: z.string().nullable(),
    deviceName: z.string().nullable(),
    place: placeSchema.nullable(),
    rule: ruleRefSchema.nullable(),
    loop: z.number().nullable(),
    address: z.number().nullable(),
    zone: z.number().nullable(),
    zoneName: z.string().nullable(),
});

export const panelSituationSchema = z.object({
    state: z.enum(['offline', 'reiniciando', 'alarme', 'falha', 'supervisao', 'bloqueio', 'normal']),
    label: z.string(),
    severity: severitySchema,
    silenced: z.boolean(),
});

export const normalizedCieLogSchema = z.object({
    key: z.string(),
    type: z.enum(logTypeValues),
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
    source: z.enum(['historico', 'ativo']),
    event: eventInfoSchema,
    display: logDisplaySchema,
    number: z.number().nullable(),
    firstEvent: z.boolean().nullable(),
    origin: z.number().nullable(),
    repeater: z.number().nullable(),
    historyTotal: z.number().nullable(),
});

const countersSchema = z.object({
    alarme: z.number(),
    falha: z.number(),
    supervisao: z.number(),
    bloqueio: z.number(),
});

export const activeEventsDataSchema = z.object({
    counters: countersSchema,
    situation: panelSituationSchema,
    events: z.object({
        alarme: z.array(normalizedCieLogSchema).optional(),
        falha: z.array(normalizedCieLogSchema).optional(),
        supervisao: z.array(normalizedCieLogSchema).optional(),
        bloqueio: z.array(normalizedCieLogSchema).optional(),
    }),
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
    latestFailureEvent: normalizedCieLogSchema.nullable(),
    latestAlarmEvent: normalizedCieLogSchema.nullable(),
    situation: panelSituationSchema,
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
    activeAlarms: z.array(normalizedCieLogSchema),
    situation: panelSituationSchema,
});

export const logsListDataSchema = z.object({
    type: z.string(),
    limit: z.number(),
    cursor: z.string().nullable(),
    nextCursor: z.string().nullable(),
    items: z.array(normalizedCieLogSchema),
});

// Cadastro da central (zonas, regras e dispositivos).
const installationPointSchema = z.object({
    zone: z.number().optional(),
    loop: z.number().optional(),
    address: z.number().optional(),
});

export const installationDataSchema = z.object({
    model: z.string().nullable(),
    firmware: z.string().nullable(),
    installation: z.string().nullable(),
    zones: z.array(z.object({
        id: z.number(),
        name: z.string().nullable(),
        enabled: z.boolean(),
        place: placeSchema.nullable(),
    })),
    rules: z.array(z.object({
        id: z.number(),
        name: z.string().nullable(),
        enabled: z.boolean(),
        inputs: z.array(installationPointSchema),
        outputs: z.array(installationPointSchema),
    })),
    devices: z.array(z.object({
        loop: z.number(),
        address: z.number(),
        name: z.string().nullable(),
        device: z.string().nullable(),
        type: z.number(),
        subtype: z.number(),
        zone: z.number().nullable(),
        zoneName: z.string().nullable(),
        enabled: z.boolean(),
        localOutput: z.string().nullable(),
        place: placeSchema.nullable(),
    })),
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

export const logTypeQuerySchema = z.enum(logTypeValues);
export const activeTypeQuerySchema = z.enum(ACTIVE_TYPE_VALUES);
export const eventKindQuerySchema = z.enum(EVENT_KIND_VALUES);

// -----------------------------------------------------------------------------
// Comandos — acionam a central física
// -----------------------------------------------------------------------------

export const SIMPLE_COMMAND_ACTIONS = [
    'silence',
    'release',
    'release-bip',
    'release-siren',
    'restart',
    'brigade-siren',
    'alarm-general',
    'delay-siren',
    'silence-bip',
    'silence-siren',
] as const;
export const simpleCommandActionSchema = z.enum(SIMPLE_COMMAND_ACTIONS);

// Ações de impacto alto (disparar alarme geral para todo o condomínio,
// reiniciar a central) exigem confirmação explícita no corpo — um clique
// acidental ou um retry automático não pode dispará-las.
export const CONFIRM_REQUIRED_ACTIONS: readonly string[] = ['alarm-general', 'restart'];

export const simpleCommandBodySchema = z
    .object({ confirm: z.boolean().optional() })
    .optional();

const flag01 = z.number().int().min(0).max(1);

export const blockCommandBodySchema = z.object({
    tipoBloqueio: z.number().int().nonnegative(),
    laco: z.number().int().nonnegative(),
    numero: z.number().int().nonnegative(),
    bloquear: flag01,
});

export const outputCommandBodySchema = z.object({
    laco: z.number().int().nonnegative(),
    numero: z.number().int().nonnegative(),
    ativo: flag01,
});

export const commandResultSchema = z.object({
    action: z.string(),
    payload: z.record(z.string(), z.number()).optional(),
    response: z.unknown(),
    snapshot: cieStateSnapshotSchema,
});
