import logger from '../../core/utils/logger';
import * as notificationRepository from '../../core/repositories/notification.repository';
import { cieUpstreamEvents, isCieUpstreamConnected } from '../ws/ws.gateway';
import { notifySafely, type AppNotification, type NotificationKind } from '../notification/notification.service';
import { pick, type Lang, type Translations } from '../shared/i18n';
import { localizePlace } from './cie.i18n';

// =============================================================================
// Push da central de incêndio. O nova-cie só manda estado (cie.status.updated
// a cada consulta, cie.alarm.triggered repetido enquanto dura o alarme); as
// bordas são detectadas aqui, a partir dos contadores e da conexão:
//
// | Borda                                   | Aviso             | Público                  |
// |-----------------------------------------|-------------------|--------------------------|
// | alarme 0 → >0                           | cie.alarm         | equipe + morador ativo   |
// | alarme >0 → 0                           | cie.alarm.cleared | equipe                   |
// | falha / supervisão / bloqueio 0 → >0    | cie.failure …     | equipe                   |
// | central reiniciando                     | cie.restarting    | equipe                   |
// | sem contato por NOTIFY_CIE_OFFLINE_MINUTES | cie.offline    | equipe                   |
// | volta ao normal depois de falha, supervisão, reinício ou sem contato | cie.normalized | equipe |
//
// | volta a "Sistema normal" depois de um alarme | cie.alarm.resolved | morador ativo (não equipe) |
//
// Morador recebe só o alarme e, depois dele, o aviso comum de volta ao normal
// (decisões de 13/10 e 15/10/2026); falha, supervisão e demais ficam com a
// equipe. A prioridade vem da gravidade, nunca da localização. Alarme não
// depende de preferência: o controle é do canal no aparelho.
//
// "Sistema normal" é o mesmo critério da tela do app: sem alarme, falha,
// supervisão, reinício nem falta de contato (bloqueio não conta). Se a API
// reiniciar no meio do episódio, a pendência volta pelo histórico de envios
// (último cie.alarm sem cie.alarm.resolved depois, nas últimas 6 h).
//
// Uma borda de descida só vale depois de 30 s estável, para uma oscilação do
// contador não virar outro aviso. Ao subir a API com alarme ativo, o alarme é
// enviado se nenhum foi enviado nos últimos 10 min: repetir é melhor que
// perder um alarme de incêndio.
// =============================================================================

const CLEAR_AFTER_MS = 30_000;
const TICK_MS = 15_000;
const ALARM_RESEND_WINDOW_MS = 10 * 60_000;
// Alarme mais antigo que isso não gera "normalizada" ao subir a API: o aviso
// chegaria tarde demais para ajudar (e o TTL dele é de 6 h).
const RESIDENT_NORMAL_MAX_AGE_MS = 6 * 60 * 60_000;

type Flag = 'alarm' | 'failure' | 'supervision' | 'blocked' | 'restarting' | 'offline';
const COUNTER_FLAGS: Flag[] = ['alarm', 'failure', 'supervision', 'blocked'];
// Estados cuja volta gera "central normalizada".
const ABNORMAL_FLAGS: Flag[] = ['failure', 'supervision', 'restarting', 'offline'];

// Lida dentro da função: imports resolvem antes do dotenv.config().
const offlineMinutes = (): number => {
    const value = Number(process.env.NOTIFY_CIE_OFFLINE_MINUTES);
    return Number.isFinite(value) && value > 0 ? value : 5;
};

type FlagState = { active: boolean; raw: boolean; pendingSince: number | null };

const flags = new Map<Flag, FlagState>(
    (['alarm', 'failure', 'supervision', 'blocked', 'restarting', 'offline'] as Flag[])
        .map((flag) => [flag, { active: false, raw: false, pendingSince: null }]),
);

let ready = false;
let upstreamConnected = false;
let panelConnected = true;
let abnormalNotified = false;
/** Um alarme foi enviado aos moradores e a volta ao normal ainda não. */
let residentNormalPending = false;
/** Itens ativos por tipo (alarme, falha, supervisão), do último cie.active.updated. */
const activeItems = new Map<string, unknown[]>();

const state = (flag: Flag) => flags.get(flag)!;

const riseDelay = (flag: Flag) => (flag === 'offline' ? offlineMinutes() * 60_000 : 0);

/** Aplica o valor bruto e devolve a borda confirmada, se houver. */
const settle = (flag: Flag, now: number): 'rise' | 'fall' | null => {
    const current = state(flag);
    if (current.raw === current.active) {
        current.pendingSince = null;
        return null;
    }
    current.pendingSince ??= now;
    const delay = current.raw ? riseDelay(flag) : CLEAR_AFTER_MS;
    if (now - current.pendingSince < delay) return null;
    current.active = current.raw;
    current.pendingSince = null;
    return current.active ? 'rise' : 'fall';
};

type Place = { tower?: string | null; towerLabel?: string | null; floor?: number | null; floorLabel?: string | null; area?: string | null };

/** "Torre B · 8º andar", com o número de outros locais, a partir dos itens interpretados pelo nova-cie. */
const describePlace = (type: string, lang: Lang): string | null => {
    const items = activeItems.get(type) ?? [];
    const raw = (items[0] as { display?: { place?: Place | null } } | undefined)?.display?.place;
    if (!raw) return null;
    const place = localizePlace(raw, lang);
    const parts = [place.towerLabel, place.floorLabel].filter((part): part is string => !!part);
    const text = parts.length > 0 ? parts.join(' · ') : place.area ?? null;
    if (!text) return null;
    const others = items.length - 1;
    return others > 0
        ? pick(lang, `${text} e mais ${others} local(is)`, { en: `${text} and ${others} more location(s)`, es: `${text} y ${others} lugar(es) más` })
        : text;
};

type Text = { pt: string } & Translations;

/** Aviso da equipe com texto fixo; [body] recebe o local já no idioma do aparelho. */
const staffNotice = (
    kind: NotificationKind, title: Text, body: (lang: Lang) => string, channel: 'cie_status' | 'cie_info',
): AppNotification => ({
    kind,
    dedupeKey: `${kind}:${Date.now()}`,
    audience: { kind: 'staff' },
    preference: 'cieStaffAlerts',
    text: (lang) => ({ title: pick(lang, title.pt, title), body: body(lang) }),
    channel,
    priority: 'normal',
    ttlSeconds: 6 * 60 * 60,
    collapseKey: 'cie-status',
    target: 'fire',
});

const sendAlarm = () => {
    residentNormalPending = true;
    void notifySafely({
        kind: 'cie.alarm',
        dedupeKey: `cie.alarm:${Date.now()}`,
        audience: { kind: 'staff+residents' },
        text: (lang) => {
            const place = describePlace('alarme', lang);
            return {
                title: pick(lang, 'Alarme de incêndio', { en: 'Fire alarm', es: 'Alarma de incendio' }),
                body: place
                    ? pick(lang, `Alarme acionado: ${place}. Siga as orientações de segurança.`, {
                        en: `Alarm triggered: ${place}. Follow the safety instructions.`,
                        es: `Alarma activada: ${place}. Siga las instrucciones de seguridad.`,
                    })
                    : pick(lang, 'Alarme acionado na central de incêndio. Siga as orientações de segurança.', {
                        en: 'Alarm triggered on the fire panel. Follow the safety instructions.',
                        es: 'Alarma activada en la central de incendios. Siga las instrucciones de seguridad.',
                    }),
            };
        },
        channel: 'cie_alarm',
        priority: 'high',
        // Um alarme que chega meia hora depois mais confunde do que ajuda.
        ttlSeconds: 30 * 60,
        collapseKey: 'cie-alarm',
        target: 'fire',
    });
};

const onRise = (flag: Flag) => {
    if (ABNORMAL_FLAGS.includes(flag)) abnormalNotified = true;
    switch (flag) {
        case 'alarm':
            sendAlarm();
            return;
        case 'failure':
            void notifySafely(staffNotice('cie.failure',
                { pt: 'Central de incêndio: falha', en: 'Fire panel: fault', es: 'Central de incendios: falla' },
                (lang) => {
                    const place = describePlace('falha', lang);
                    return place
                        ? pick(lang, `Falha registrada: ${place}.`, { en: `Fault recorded: ${place}.`, es: `Falla registrada: ${place}.` })
                        : pick(lang, 'A central registrou uma falha. Verifique o painel.', {
                            en: 'The fire panel recorded a fault. Check the panel.', es: 'La central registró una falla. Verifique el panel.',
                        });
                }, 'cie_status'));
            return;
        case 'supervision':
            void notifySafely(staffNotice('cie.supervision',
                { pt: 'Central de incêndio: supervisão', en: 'Fire panel: supervision', es: 'Central de incendios: supervisión' },
                (lang) => {
                    const place = describePlace('supervisao', lang);
                    return place
                        ? pick(lang, `Supervisão registrada: ${place}.`, { en: `Supervision recorded: ${place}.`, es: `Supervisión registrada: ${place}.` })
                        : pick(lang, 'A central registrou um evento de supervisão.', {
                            en: 'The fire panel recorded a supervision event.', es: 'La central registró un evento de supervisión.',
                        });
                }, 'cie_status'));
            return;
        case 'blocked':
            void notifySafely(staffNotice('cie.blocked',
                { pt: 'Central de incêndio: bloqueio', en: 'Fire panel: isolation', es: 'Central de incendios: bloqueo' },
                (lang) => pick(lang, 'Há dispositivos bloqueados na central.', {
                    en: 'There are isolated devices on the fire panel.', es: 'Hay dispositivos bloqueados en la central.',
                }), 'cie_info'));
            return;
        case 'restarting':
            void notifySafely(staffNotice('cie.restarting',
                { pt: 'Central de incêndio reiniciando', en: 'Fire panel restarting', es: 'Central de incendios reiniciando' },
                (lang) => pick(lang, 'A central está sendo reiniciada.', {
                    en: 'The fire panel is restarting.', es: 'La central se está reiniciando.',
                }), 'cie_status'));
            return;
        case 'offline': {
            const minutes = offlineMinutes();
            void notifySafely(staffNotice('cie.offline',
                { pt: 'Central de incêndio sem comunicação', en: 'Fire panel offline', es: 'Central de incendios sin comunicación' },
                (lang) => pick(lang, `Sem contato com a central há mais de ${minutes} minutos.`, {
                    en: `No contact with the fire panel for more than ${minutes} minutes.`,
                    es: `Sin contacto con la central desde hace más de ${minutes} minutos.`,
                }), 'cie_status'));
        }
    }
};

/** "Sistema normal", o mesmo critério da tela do app (bloqueio não conta). */
const isAllClear = () => ['alarm', ...ABNORMAL_FLAGS].every((name) => !state(name as Flag).active);

const sendResidentNormalIfPending = () => {
    if (!residentNormalPending) return;
    residentNormalPending = false;
    void notifySafely({
        kind: 'cie.alarm.resolved',
        dedupeKey: `cie.alarm.resolved:${Date.now()}`,
        audience: { kind: 'residents' },
        text: (lang) => ({
            title: pick(lang, 'Central de incêndio normalizada', { en: 'Fire panel back to normal', es: 'Central de incendios normalizada' }),
            body: pick(lang, 'O alarme foi encerrado e a central voltou ao estado normal.', {
                en: 'The alarm has ended and the fire panel is back to normal.',
                es: 'La alarma terminó y la central volvió a la normalidad.',
            }),
        }),
        channel: 'general',
        priority: 'normal',
        ttlSeconds: 6 * 60 * 60,
        // Mesma chave do alarme: no aparelho, substitui a notificação do alarme.
        collapseKey: 'cie-alarm',
        target: 'fire',
    });
};

const onFall = (flag: Flag) => {
    if (flag === 'alarm') {
        void notifySafely(staffNotice('cie.alarm.cleared',
            { pt: 'Alarme de incêndio encerrado', en: 'Fire alarm ended', es: 'Alarma de incendio terminada' },
            (lang) => pick(lang, 'A central não indica mais alarme ativo.', {
                en: 'The fire panel no longer shows an active alarm.', es: 'La central ya no indica una alarma activa.',
            }), 'cie_status'));
    }
    const allClear = isAllClear();
    if (allClear) sendResidentNormalIfPending();
    if (abnormalNotified && allClear && ABNORMAL_FLAGS.includes(flag)) {
        abnormalNotified = false;
        void notifySafely(staffNotice('cie.normalized',
            { pt: 'Central de incêndio normalizada', en: 'Fire panel back to normal', es: 'Central de incendios normalizada' },
            (lang) => pick(lang, 'A central voltou ao estado normal.', {
                en: 'The fire panel is back to normal.', es: 'La central volvió a la normalidad.',
            }), 'cie_info'));
    }
};

const evaluate = () => {
    const now = Date.now();
    const offline = state('offline');
    offline.raw = !upstreamConnected || !panelConnected;

    // "Sem contato" vale desde a subida da API, mesmo sem nenhum estado recebido.
    // Sem contato, os contadores são os últimos conhecidos: não confirmar descida nem subida com eles.
    const names: Flag[] = !ready
        ? ['offline']
        : offline.active ? ['restarting', 'offline'] : [...COUNTER_FLAGS, 'restarting', 'offline'];
    for (const name of names) {
        const edge = settle(name, now);
        if (edge === 'rise') onRise(name);
        if (edge === 'fall') onFall(name);
    }
};

type StatusSnapshot = {
    connected?: boolean;
    restartingUntil?: number | null;
    status?: { status?: Record<string, unknown> } | null;
};

const count = (status: Record<string, unknown> | undefined, key: string) => Number(status?.[key] ?? 0) > 0;

/** Primeiro estado depois de subir: vira a base, sem avisos, exceto o alarme e a volta ao normal pendente (ver cabeçalho). */
const takeBaseline = async () => {
    for (const name of [...COUNTER_FLAGS, 'restarting'] as Flag[]) {
        const current = state(name);
        current.active = current.raw;
        current.pendingSince = null;
    }
    ready = true;

    // Alarme enviado antes de reiniciar e ainda sem a volta ao normal: retoma a
    // pendência pelo histórico do banco. Se a central já está normal, avisa agora.
    const last = await notificationRepository.lastDispatchAt('cie.alarm');
    const lastResolved = await notificationRepository.lastDispatchAt('cie.alarm.resolved');
    if (last && Date.now() - last.getTime() < RESIDENT_NORMAL_MAX_AGE_MS
        && (!lastResolved || lastResolved < last)) {
        residentNormalPending = true;
    }
    if (!state('alarm').active) {
        if (isAllClear()) sendResidentNormalIfPending();
        return;
    }

    if (!last || Date.now() - last.getTime() > ALARM_RESEND_WINDOW_MS) {
        logger.warn('[ApiV3 Push] Alarme de incêndio já ativo ao iniciar o monitor; enviando aviso.');
        sendAlarm();
    }
};

let baselinePending = false;

const onStatus = (snapshot: StatusSnapshot) => {
    const counters = snapshot.status?.status;
    if (typeof snapshot.connected === 'boolean') panelConnected = snapshot.connected;
    if (counters) {
        state('alarm').raw = count(counters, 'alarme');
        state('failure').raw = count(counters, 'falha');
        state('supervision').raw = count(counters, 'supervisao');
        state('blocked').raw = count(counters, 'bloqueio');
    }
    state('restarting').raw = typeof snapshot.restartingUntil === 'number' && snapshot.restartingUntil > Date.now();

    if (!ready) {
        if (!counters || baselinePending) return;
        baselinePending = true;
        takeBaseline()
            .catch((error) => {
                ready = true;
                logger.error('[ApiV3 Push] Falha ao conferir alarme anterior; enviando por segurança:', error);
                if (state('alarm').active) sendAlarm();
            })
            .finally(() => { baselinePending = false; });
        return;
    }
    evaluate();
};

/** Liga o monitor aos eventos do nova-cie repassados pelo gateway do WebSocket. */
export const startCieNotifications = (): void => {
    if (!process.env.CIE_SERVICE_TOKEN) {
        logger.warn('[ApiV3 Push] CIE_SERVICE_TOKEN ausente — avisos da central desativados.');
        return;
    }

    // O gateway pode ter conectado antes deste monitor subir; sem isto, o "sem
    // contato" dispararia 5 min depois de cada deploy (visto em 14/10/2026).
    upstreamConnected = isCieUpstreamConnected();

    cieUpstreamEvents.on('event', ({ event, data }: { event: string; data: unknown }) => {
        // Evento recebido prova que a API está ligada ao nova-cie.
        upstreamConnected = true;
        try {
            if (event === 'cie.status.updated') {
                onStatus((data ?? {}) as StatusSnapshot);
            } else if (event === 'cie.active.updated') {
                const update = data as { type?: string; items?: unknown[] };
                if (update?.type) activeItems.set(update.type, Array.isArray(update.items) ? update.items : []);
            } else if (event === 'cie.connection.changed') {
                panelConnected = (data as { connected?: boolean })?.connected === true;
                evaluate();
            }
        } catch (error) {
            // Listener síncrono do gateway: exceção aqui não pode derrubar o repasse aos clientes.
            logger.error('[ApiV3 Push] Falha ao processar evento da central:', error);
        }
    });

    cieUpstreamEvents.on('connection', (connected: boolean) => {
        upstreamConnected = connected;
        try {
            evaluate();
        } catch (error) {
            logger.error('[ApiV3 Push] Falha ao processar conexão com a central:', error);
        }
    });

    // Confirma descidas e o "sem contato" mesmo quando não chegam eventos.
    setInterval(() => {
        try {
            evaluate();
        } catch (error) {
            logger.error('[ApiV3 Push] Falha no laço de avisos da central:', error);
        }
    }, TICK_MS).unref();
};
