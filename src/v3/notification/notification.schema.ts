import { z } from 'zod';

export const deviceBodySchema = z.object({
    /** UUID gerado pelo app na instalação; continua o mesmo quando o token FCM troca. */
    installationId: z.uuid(),
    /** Token FCM do aparelho. */
    token: z.string().trim().min(20).max(4096),
    appVersion: z.string().trim().max(40).optional(),
    osVersion: z.string().trim().max(40).optional(),
    deviceModel: z.string().trim().max(80).optional(),
    /** Permissão de notificação do sistema (Android 13+: POST_NOTIFICATIONS). */
    notificationsEnabled: z.boolean(),
    /** Canal do alarme de incêndio não bloqueado pelo usuário. */
    alarmChannelEnabled: z.boolean().default(true),
});

export const deviceParamsSchema = z.object({ installationId: z.uuid() });

export const deviceSchema = z.object({
    platform: z.enum(['android', 'ios']),
    installationId: z.string(),
    notificationsEnabled: z.boolean(),
    alarmChannelEnabled: z.boolean(),
    registeredAt: z.iso.datetime(),
});

export const preferenceSchema = z.object({
    exhaustExpiring: z.boolean(),
    /** Minutos antes do desligamento automático; fixo no servidor. */
    exhaustExpiringMinutes: z.number().int().positive(),
    exhaustOff: z.boolean(),
    messages: z.boolean(),
    /** Alertas da central além do alarme (falha, reinício, sem comunicação…). Só vale para a equipe. */
    cieStaffAlerts: z.boolean(),
});

export const preferenceBodySchema = z.object({
    exhaustExpiring: z.boolean().optional(),
    exhaustOff: z.boolean().optional(),
    messages: z.boolean().optional(),
    cieStaffAlerts: z.boolean().optional(),
}).refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Informe ao menos uma preferência.',
    path: [],
});

export const fireAlarmTestBodySchema = z.object({
    /** Aparelho que recebe o teste (qualquer conta); ver notification_device. */
    installationId: z.uuid(),
});

export const testResultSchema = z.object({
    targets: z.number().int().nonnegative(),
    sent: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
});
