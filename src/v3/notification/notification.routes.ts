import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import logger from '../../core/utils/logger';
import * as notificationRepository from '../../core/repositories/notification.repository';
import { successResponseSchema } from '../shared/response';
import { requireAuth, requireRole } from '../shared/require-auth';
import { AttemptLimiter } from '../shared/attempt-limiter';
import { exhaustExpiringMinutes } from '../exhaust/exhaust.notifications';
import { isPushAvailable } from './fcm.sender';
import { notify, resolveResidentActive } from './notification.service';
import {
    deviceBodySchema,
    deviceParamsSchema,
    deviceSchema,
    fireAlarmTestBodySchema,
    preferenceBodySchema,
    preferenceSchema,
    testResultSchema,
} from './notification.schema';

// =============================================================================
// Push nativo do app (mecanismo novo, separado do Web Push de /push/*).
// O app registra o aparelho a cada abertura, quando o token FCM troca e
// quando a permissão muda; remove no logout. Rotas por plataforma: /android
// grava; /ios responde vazio e não grava nada até existir o app iOS.
// requireAuth explícito: tudo depende de request.actor.
// =============================================================================

// O app registra em cada abertura; folga para troca de token e permissão.
const registrationsByAccount = new AttemptLimiter(30, 60 * 60 * 1000);
// Cada teste dispara uma notificação real em todos os aparelhos da conta.
const testsByAccount = new AttemptLimiter(3, 10 * 60 * 1000);
const fireAlarmTestsByAccount = new AttemptLimiter(3, 10 * 60 * 1000);

const checkLimit = (limiter: AttemptLimiter, request: FastifyRequest, reply: FastifyReply, accountId: string) => {
    const retryAfter = limiter.retryAfter(accountId);
    if (retryAfter > 0) {
        reply.header('Retry-After', String(retryAfter));
        reply.fail({ type: 'rate-limited', detail: 'Muitas tentativas. Tente novamente em instantes.', instance: request.url });
        return false;
    }
    limiter.hit(accountId);
    return true;
};

const toPreferenceResponse = (value: notificationRepository.NotificationPreference) => ({
    ...value,
    exhaustExpiringMinutes: exhaustExpiringMinutes(),
});

export async function notificationRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.put('/notifications/devices/android', {
        onRequest: requireAuth,
        schema: { body: deviceBodySchema, response: { 200: successResponseSchema(deviceSchema) } },
    }, async (request, reply) => {
        const actor = request.actor!;
        if (!checkLimit(registrationsByAccount, request, reply, actor.id)) return;
        const body = request.body;
        try {
            const device = await notificationRepository.upsertDevice({
                accountId: actor.id,
                platform: 'android',
                installationId: body.installationId,
                token: body.token,
                appVersion: body.appVersion ?? null,
                osVersion: body.osVersion ?? null,
                deviceModel: body.deviceModel ?? null,
                notificationsEnabled: body.notificationsEnabled,
                alarmChannelEnabled: body.alarmChannelEnabled,
                role: actor.role,
                residentActive: await resolveResidentActive(actor.id),
            });
            return reply.ok({ ...device, registeredAt: device.registeredAt.toISOString() });
        } catch (error) {
            logger.error('[ApiV3 Push] Falha ao registrar aparelho:', error);
            return reply.fail({ type: 'internal-error', detail: 'Falha ao registrar o aparelho.', instance: request.url });
        }
    });

    typedApp.delete('/notifications/devices/android/:installationId', {
        onRequest: requireAuth,
        schema: { params: deviceParamsSchema, response: { 200: successResponseSchema(z.null()) } },
    }, async (request, reply) => {
        try {
            // Idempotente: aparelho já removido (ou de outra conta) também responde 200.
            await notificationRepository.deleteDevice(request.actor!.id, 'android', request.params.installationId);
            return reply.ok(null);
        } catch (error) {
            logger.error('[ApiV3 Push] Falha ao remover aparelho:', error);
            return reply.fail({ type: 'internal-error', detail: 'Falha ao remover o aparelho.', instance: request.url });
        }
    });

    // iOS: reservado. Aceita o mesmo corpo para o app iOS já nascer com o
    // contrato certo, mas não grava nada enquanto o envio APNs não existir.
    typedApp.put('/notifications/devices/ios', {
        onRequest: requireAuth,
        schema: { body: deviceBodySchema, response: { 200: successResponseSchema(z.null()) } },
    }, async (_request, reply) => reply.ok(null));

    typedApp.delete('/notifications/devices/ios/:installationId', {
        onRequest: requireAuth,
        schema: { params: deviceParamsSchema, response: { 200: successResponseSchema(z.null()) } },
    }, async (_request, reply) => reply.ok(null));

    typedApp.get('/notifications/preferences', {
        onRequest: requireAuth,
        schema: { response: { 200: successResponseSchema(preferenceSchema) } },
    }, async (request, reply) => {
        try {
            return reply.ok(toPreferenceResponse(await notificationRepository.readPreference(request.actor!.id)));
        } catch (error) {
            logger.error('[ApiV3 Push] Falha ao ler preferências de notificação:', error);
            return reply.fail({ type: 'internal-error', detail: 'Falha ao carregar as preferências.', instance: request.url });
        }
    });

    typedApp.put('/notifications/preferences', {
        onRequest: requireAuth,
        schema: { body: preferenceBodySchema, response: { 200: successResponseSchema(preferenceSchema) } },
    }, async (request, reply) => {
        const accountId = request.actor!.id;
        try {
            const current = await notificationRepository.readPreference(accountId);
            const next = {
                exhaustExpiring: request.body.exhaustExpiring ?? current.exhaustExpiring,
                exhaustOff: request.body.exhaustOff ?? current.exhaustOff,
                messages: request.body.messages ?? current.messages,
                cieStaffAlerts: request.body.cieStaffAlerts ?? current.cieStaffAlerts,
            };
            return reply.ok(toPreferenceResponse(await notificationRepository.writePreference(accountId, next)));
        } catch (error) {
            logger.error('[ApiV3 Push] Falha ao gravar preferências de notificação:', error);
            return reply.fail({ type: 'internal-error', detail: 'Falha ao salvar as preferências.', instance: request.url });
        }
    });

    // Aviso de teste para os aparelhos da própria conta (tela Notificações e validação).
    typedApp.post('/notifications/test', {
        onRequest: requireAuth,
        schema: { response: { 200: successResponseSchema(testResultSchema) } },
    }, async (request, reply) => {
        const accountId = request.actor!.id;
        if (!isPushAvailable()) {
            return reply.fail({ type: 'upstream-error', detail: 'O envio de notificações está desativado no servidor.', instance: request.url, status: 503 });
        }
        if (!checkLimit(testsByAccount, request, reply, accountId)) return;
        try {
            const result = await notify({
                kind: 'test',
                dedupeKey: `test:${accountId}:${Date.now()}`,
                audience: { kind: 'accounts', accountIds: [accountId] },
                title: 'Notificação de teste',
                body: 'As notificações do Nova Residence estão funcionando neste aparelho.',
                channel: 'general',
                priority: 'normal',
                ttlSeconds: 10 * 60,
                collapseKey: 'test',
                target: 'home',
            });
            return reply.ok({ targets: result?.targets ?? 0, sent: result?.success ?? 0, failed: result?.failure ?? 0 });
        } catch (error) {
            logger.error('[ApiV3 Push] Falha ao enviar notificação de teste:', error);
            return reply.fail({ type: 'internal-error', detail: 'Falha ao enviar a notificação de teste.', instance: request.url });
        }
    });

    // Teste do alerta prioritário do alarme de incêndio, sem acionar a central:
    // mesmo payload, canal e prioridade do aviso real (cie.notifications.ts),
    // para um único aparelho. Só admin: um alarme no celular de outra pessoa assusta.
    typedApp.post('/notifications/test/fire-alarm', {
        onRequest: [requireAuth, requireRole('admin')],
        schema: { body: fireAlarmTestBodySchema, response: { 200: successResponseSchema(testResultSchema) } },
    }, async (request, reply) => {
        const accountId = request.actor!.id;
        const { installationId, type } = request.body;
        if (!isPushAvailable()) {
            return reply.fail({ type: 'upstream-error', detail: 'O envio de notificações está desativado no servidor.', instance: request.url, status: 503 });
        }
        if (!checkLimit(fireAlarmTestsByAccount, request, reply, accountId)) return;
        try {
            // Gravados como *.test: não contam na regra de reenvio nem na pendência da normalizada.
            const result = await notify(type === 'resolved'
                ? {
                    kind: 'cie.alarm.resolved',
                    dispatchKind: 'cie.alarm.resolved.test',
                    dedupeKey: `cie.alarm.resolved.test:${installationId}:${Date.now()}`,
                    audience: { kind: 'device', installationId },
                    title: 'Central de incêndio normalizada (teste)',
                    body: 'Teste do aviso de volta ao normal. Nenhum alarme real foi acionado.',
                    channel: 'general',
                    priority: 'normal',
                    ttlSeconds: 6 * 60 * 60,
                    collapseKey: 'cie-alarm',
                    target: 'fire',
                }
                : {
                    kind: 'cie.alarm',
                    dispatchKind: 'cie.alarm.test',
                    dedupeKey: `cie.alarm.test:${installationId}:${Date.now()}`,
                    audience: { kind: 'device', installationId },
                    title: 'Alarme de incêndio (teste)',
                    body: 'Teste do alerta prioritário. Nenhum alarme real foi acionado.',
                    channel: 'cie_alarm',
                    priority: 'high',
                    ttlSeconds: 30 * 60,
                    collapseKey: 'cie-alarm',
                    target: 'fire',
                });
            if (!result || result.targets === 0) {
                return reply.fail({ type: 'not-found', detail: 'Aparelho não encontrado ou com notificações desativadas.', instance: request.url });
            }
            logger.warn(`[ApiV3 Push] Teste do alarme de incêndio (${type}) enviado por ${accountId} para ${installationId}.`);
            return reply.ok({ targets: result.targets, sent: result.success, failed: result.failure });
        } catch (error) {
            logger.error('[ApiV3 Push] Falha ao enviar teste do alarme de incêndio:', error);
            return reply.fail({ type: 'internal-error', detail: 'Falha ao enviar o teste do alarme.', instance: request.url });
        }
    });
}
