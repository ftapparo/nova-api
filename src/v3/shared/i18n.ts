// =============================================================================
// Idioma dos textos gerados pela API para o app (português, inglês e espanhol).
// O app envia `Accept-Language` com o idioma escolhido nele (`pt-BR`, `en` ou
// `es`) e grava o mesmo idioma no registro do aparelho para o push. Sem
// cabeçalho, ou com outro idioma, tudo sai em português, como antes.
//
// O que é traduzido: `detail` dos erros, rótulos da central (cie.i18n.ts) e
// textos do push. O que não é: `error.title` (chave estável do contrato — o app
// decide recusas do exaustor por ele), comunicados escritos pelo síndico e os
// documentos jurídicos (o oficial é em português).
// =============================================================================

export const LANGS = ['pt-BR', 'en', 'es'] as const;
export type Lang = (typeof LANGS)[number];

/** Primeiro idioma suportado da lista, na ordem de preferência (q) do cliente; padrão pt-BR. */
export const resolveLang = (header: string | string[] | undefined): Lang => {
    const value = Array.isArray(header) ? header.join(',') : header;
    if (!value) return 'pt-BR';
    const tags = value.split(',')
        .map((part, index) => {
            const [tag, ...params] = part.trim().split(';');
            const q = Number(params.find((param) => param.trim().startsWith('q='))?.trim().slice(2) ?? 1);
            return { language: tag.trim().toLowerCase().split('-')[0], q: Number.isFinite(q) ? q : 0, index };
        })
        .filter((tag) => tag.q > 0)
        .sort((a, b) => b.q - a.q || a.index - b.index);
    for (const { language } of tags) {
        if (language === 'pt') return 'pt-BR';
        if (language === 'en' || language === 'es') return language;
    }
    return 'pt-BR';
};

/** Idioma gravado no aparelho (push); valor desconhecido vira português. */
export const toLang = (value: string | null | undefined): Lang =>
    (LANGS as readonly string[]).includes(value ?? '') ? (value as Lang) : 'pt-BR';

export type Translations = { en: string; es: string };

/** Escolhe o texto do idioma; o português é o próprio texto de origem. */
export const pick = (lang: Lang, pt: string, other: Translations): string => (lang === 'pt-BR' ? pt : other[lang]);

// `detail` dos erros, pelo texto em português (o mesmo das chamadas a reply.fail).
// Texto fora daqui, ou montado com variáveis, segue em português.
const DETAILS: Record<string, Translations> = {
    'Acesso negado.': { en: 'Access denied.', es: 'Acceso denegado.' },
    'Não autorizado.': { en: 'Not authorized.', es: 'No autorizado.' },
    'Muitos comandos. Tente novamente em instantes.': { en: 'Too many commands. Try again shortly.', es: 'Demasiados comandos. Inténtelo de nuevo en unos instantes.' },
    'Muitas tentativas. Tente novamente mais tarde.': { en: 'Too many attempts. Try again later.', es: 'Demasiados intentos. Inténtelo de nuevo más tarde.' },
    'Muitas tentativas. Tente novamente em instantes.': { en: 'Too many attempts. Try again shortly.', es: 'Demasiados intentos. Inténtelo de nuevo en unos instantes.' },
    'Muitas consultas. Tente novamente em instantes.': { en: 'Too many requests. Try again shortly.', es: 'Demasiadas consultas. Inténtelo de nuevo en unos instantes.' },
    'Serviço de autenticação indisponível.': { en: 'Authentication service unavailable.', es: 'Servicio de autenticación no disponible.' },
    'O envio de notificações está desativado no servidor.': { en: 'Sending notifications is turned off on the server.', es: 'El envío de notificaciones está desactivado en el servidor.' },
    'Notificações indisponíveis no momento.': { en: 'Notifications are unavailable right now.', es: 'Las notificaciones no están disponibles en este momento.' },
    'Falha ao carregar os comunicados.': { en: 'Failed to load announcements.', es: 'No fue posible cargar los comunicados.' },
    'Falha ao carregar preferências.': { en: 'Failed to load preferences.', es: 'No fue posible cargar las preferencias.' },
    'Falha ao carregar as preferências.': { en: 'Failed to load preferences.', es: 'No fue posible cargar las preferencias.' },
    'Falha ao salvar preferências.': { en: 'Failed to save preferences.', es: 'No fue posible guardar las preferencias.' },
    'Falha ao salvar as preferências.': { en: 'Failed to save preferences.', es: 'No fue posible guardar las preferencias.' },
    'Falha ao registrar o aparelho.': { en: 'Failed to register the device.', es: 'No fue posible registrar el dispositivo.' },
    'Falha ao remover o aparelho.': { en: 'Failed to remove the device.', es: 'No fue posible eliminar el dispositivo.' },
    'Falha ao enviar a notificação.': { en: 'Failed to send the notification.', es: 'No fue posible enviar la notificación.' },
    'Falha ao enviar a notificação de teste.': { en: 'Failed to send the test notification.', es: 'No fue posible enviar la notificación de prueba.' },
    'Aparelho não encontrado ou com notificações desativadas.': { en: 'Device not found or with notifications turned off.', es: 'Dispositivo no encontrado o con notificaciones desactivadas.' },
    'Este comando exige confirmação explícita.': { en: 'This command requires explicit confirmation.', es: 'Este comando requiere confirmación explícita.' },
    'É preciso estar no condomínio para ligar o exaustor.': { en: 'You need to be at the condominium to turn on the exhaust fan.', es: 'Debe estar en el condominio para encender el extractor.' },
    'Envie a localização do aparelho para ligar o exaustor.': { en: 'Send the device location to turn on the exhaust fan.', es: 'Envíe la ubicación del dispositivo para encender el extractor.' },
    'O comando não é aceito com localização simulada.': { en: 'The command is not accepted with a mock location.', es: 'El comando no se acepta con ubicación simulada.' },
    'Não foi possível confirmar a localização com precisão.': { en: 'The location could not be confirmed precisely.', es: 'No fue posible confirmar la ubicación con precisión.' },
    'Verificação de localização indisponível.': { en: 'Location check unavailable.', es: 'Verificación de ubicación no disponible.' },
    'Exaustor não encontrado.': { en: 'Exhaust fan not found.', es: 'Extractor no encontrado.' },
    'Exaustor em manutenção.': { en: 'Exhaust fan under maintenance.', es: 'Extractor en mantenimiento.' },
    'Não foi possível salvar a manutenção.': { en: 'Unable to save the maintenance status.', es: 'No fue posible guardar el mantenimiento.' },
    'Versão do documento não encontrada.': { en: 'Document version not found.', es: 'Versión del documento no encontrada.' },
    'O Termo de Uso foi atualizado. Leia a versão vigente.': { en: 'The Terms of Use have been updated. Read the current version.', es: 'Los Términos de Uso se actualizaron. Lea la versión vigente.' },
    'Aceite a versão vigente do Termo de Uso.': { en: 'Accept the current version of the Terms of Use.', es: 'Acepte la versión vigente de los Términos de Uso.' },
    'Troque a senha provisória para continuar.': { en: 'Change your temporary password to continue.', es: 'Cambie la contraseña temporal para continuar.' },
    'Senha atual incorreta.': { en: 'Incorrect current password.', es: 'Contraseña actual incorrecta.' },
    'Credenciais inválidas.': { en: 'Invalid credentials.', es: 'Credenciales inválidas.' },
    'Código inválido ou expirado.': { en: 'Invalid or expired code.', es: 'Código inválido o vencido.' },
    'Já existe uma conta com este e-mail.': { en: 'An account with this e-mail already exists.', es: 'Ya existe una cuenta con este correo electrónico.' },
    'Contas da equipe são removidas pela administração do condomínio.': { en: 'Staff accounts are removed by the condominium management.', es: 'Las cuentas del equipo las elimina la administración del condominio.' },
    'Conta sem vínculo.': { en: 'Account not linked.', es: 'Cuenta sin vínculo.' },
    'Conta sem e-mail.': { en: 'Account without e-mail.', es: 'Cuenta sin correo electrónico.' },
    'Conta não encontrada.': { en: 'Account not found.', es: 'Cuenta no encontrada.' },
    'Comunicado não encontrado.': { en: 'Announcement not found.', es: 'Comunicado no encontrado.' },
    'Um ou mais campos da requisição são inválidos.': { en: 'One or more request fields are invalid.', es: 'Uno o más campos de la solicitud no son válidos.' },
    'Erro inesperado ao chamar serviço interno.': { en: 'Unexpected error calling an internal service.', es: 'Error inesperado al llamar a un servicio interno.' },
};

export const translateDetail = (lang: Lang, detail: string | null | undefined): string | null | undefined => {
    if (lang === 'pt-BR' || !detail) return detail;
    return DETAILS[detail]?.[lang] ?? detail;
};
