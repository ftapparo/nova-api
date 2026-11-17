import { z } from 'zod';
import { LANGS } from '../shared/i18n';

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
    /** Idioma do app: o push deste aparelho sai nele. Ausente mantém o gravado (padrão pt-BR). */
    language: z.enum(LANGS).optional(),
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
    /** alarm = alarme (padrão); resolved = "central normalizada" que o morador recebe depois do alarme. */
    type: z.enum(['alarm', 'resolved']).default('alarm'),
});

/** Aparelho registrado, para o admin escolher o destino do teste do alarme. Sem o token FCM. */
export const deviceSummarySchema = z.object({
    accountId: z.string(),
    /** E-mail da conta no momento da consulta; nulo se a conta não existe mais ou o serviço de contas falhou. */
    email: z.string().nullable(),
    platform: z.enum(['android', 'ios']),
    installationId: z.string(),
    appVersion: z.string().nullable(),
    osVersion: z.string().nullable(),
    deviceModel: z.string().nullable(),
    language: z.string(),
    /** Papel gravado no último registro do aparelho. */
    role: z.string().nullable(),
    notificationsEnabled: z.boolean(),
    alarmChannelEnabled: z.boolean(),
    /** Falso quando o FCM recusou o token; volta a valer quando o app registrar de novo. */
    tokenValid: z.boolean(),
    createdAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
});

export const testResultSchema = z.object({
    targets: z.number().int().nonnegative(),
    sent: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
});
