import { z } from 'zod';

// Id do exaustor: torre (A/B/C) + final do apartamento (1-8). Aceita
// "A4", "a-4", "A_4"; a rota sempre repassa ao core no formato canônico
// "A4" — o core normaliza "A-4" para "A_4", o que geraria dois ids para o
// mesmo exaustor na memória de acionamentos.
export const exhaustIdSchema = z
    .string()
    .trim()
    .regex(/^[ABCabc][-_]?[1-8]$/, 'Use torre A/B/C e final 1-8, ex.: A4')
    .transform((value) => `${value[0].toUpperCase()}${value[value.length - 1]}`);

// Também aceita o exaustor simulado da unidade de demonstração (ex.: XYZ0,
// ver exhaust.demo.ts). Quem decide se o id vale para a conta é a rota.
const commandIdSchema = z
    .string()
    .trim()
    .regex(/^([ABCabc][-_]?[1-8]|[A-Za-z]{1,5}[0-9])$/, 'Use torre A/B/C e final 1-8, ex.: A4')
    .transform((value) => value.toUpperCase().replace(/[-_]/g, ''));

export const exhaustParamsSchema = z.object({ id: commandIdSchema });
/** Só exaustores reais (manutenção e configuração mexem em equipamento). */
export const realExhaustParamsSchema = z.object({ id: exhaustIdSchema });

export const turnOnBodySchema = z
    .object({
        // Opcional: sem tempo, fica ligado até alguém desligar (mesmo
        // comportamento da v2). Teto de 24 h só para não aceitar lixo.
        minutes: z.number().int().positive().max(1440).optional(),
        // Localização do aparelho no momento do comando (decisão de
        // 13/10/2026): exigida do morador, ignorada para a equipe. Só valida
        // a presença no condomínio; nunca é gravada nem registrada em log.
        location: z
            .object({
                latitude: z.number().min(-90).max(90),
                longitude: z.number().min(-180).max(180),
                /** Raio de precisão em metros, como o Android informa. */
                accuracy: z.number().positive().max(100000),
                /** Localização simulada (opções do desenvolvedor). */
                mock: z.boolean(),
            })
            .optional(),
    })
    .default({});

export const exhaustSchema = z.object({
    id: z.string(),
    tower: z.string(),
    final: z.number().int(),
    on: z.boolean(),
    /** Desligamento automático agendado (epoch ms), ou null. */
    expiresAt: z.number().nullable(),
    /** Andamento do último comando: iniciando | executado | erro. */
    processStatus: z.string().nullable(),
    moduleOnline: z.boolean(),
    /** Direção do último comando: permite distinguir ligando de desligando. */
    command: z.enum(['ligar', 'desligar']).nullable(),
    /** Marcado pela equipe; enquanto verdadeiro, o app não permite ligar. */
    maintenance: z.boolean(),
    /** Exaustor de demonstração (conta de revisão das lojas): nenhum comando chega ao relé. */
    simulated: z.boolean().optional(),
});
export type Exhaust = z.infer<typeof exhaustSchema>;

// Módulos Tasmota conhecidos (EXHAUST_*_HOST). Só o nome é aceito — a v2
// também aceita IP ou índice, o que deixaria a rota mandar comando para
// qualquer endereço da rede.
export const EXHAUST_MODULES = ['A_14', 'A_58', 'B_14', 'B_58', 'C_14', 'C_58', 'PWR_14', 'PWR_58'] as const;

export const maintenanceBodySchema = z.object({ maintenance: z.boolean() });

export const configParamsSchema = z.object({
    modulo: z.string().trim().transform((value) => value.toUpperCase()).pipe(z.enum(EXHAUST_MODULES)),
});

export const configBodySchema = z.object({
    /** Comando backlog do Tasmota, já encodado (mesmo campo da v2). */
    comando: z.string().trim().min(1).max(1000),
});
