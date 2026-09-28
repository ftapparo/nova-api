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

export const exhaustParamsSchema = z.object({ id: exhaustIdSchema });

export const turnOnBodySchema = z
    .object({
        // Opcional: sem tempo, fica ligado até alguém desligar (mesmo
        // comportamento da v2). Teto de 24 h só para não aceitar lixo.
        minutes: z.number().int().positive().max(1440).optional(),
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
});
export type Exhaust = z.infer<typeof exhaustSchema>;
