import { pick, type Lang, type Translations } from '../shared/i18n';

// =============================================================================
// Rótulos da central no idioma do app. O nova-cie interpreta os códigos da
// central e devolve tudo em português (event.label, display.place.*Label,
// situation.label); aqui a API refaz esses rótulos a partir dos campos
// estruturados (categoria + código, torre, andar, estado), sem o app precisar
// interpretar nada. Nomes cadastrados no painel (deviceName, zoneName, regra,
// areaDetail) não são traduzidos: são dados do condomínio.
//
// As tabelas seguem a ordem dos códigos de src/core/services/cie-event-catalog.ts
// no nova-cie; código ou rótulo fora delas fica em português.
// =============================================================================

// Rótulos dos eventos pelo texto em português do catálogo do nova-cie.
const EVENT_LABELS: Record<string, Translations> = {
    // Alarme
    'Nenhum Alarme': { en: 'No Alarm', es: 'Ninguna Alarma' },
    Alarme: { en: 'Alarm', es: 'Alarma' },
    'Reset de Alarme': { en: 'Alarm Reset', es: 'Reinicio de Alarma' },
    'Saída Confirmada': { en: 'Output Confirmed', es: 'Salida Confirmada' },
    'Saída Desativada': { en: 'Output Deactivated', es: 'Salida Desactivada' },
    'IO Restaurada': { en: 'IO Restored', es: 'IO Restaurada' },
    'Sistema em Alarme': { en: 'System in Alarm', es: 'Sistema en Alarma' },
    // Supervisão
    'Nenhuma Supervisão': { en: 'No Supervision', es: 'Ninguna Supervisión' },
    'Supervisão': { en: 'Supervision', es: 'Supervisión' },
    'Reset de Supervisão': { en: 'Supervision Reset', es: 'Reinicio de Supervisión' },
    'Sistema em Supervisão': { en: 'System in Supervision', es: 'Sistema en Supervisión' },
    // Falha
    'Falhas Restauradas': { en: 'Faults Restored', es: 'Fallas Restauradas' },
    'Dispositivo Inconsistente': { en: 'Inconsistent Device', es: 'Dispositivo Inconsistente' },
    'Dispositivo Não Configurado': { en: 'Device Not Configured', es: 'Dispositivo No Configurado' },
    'Saída Padrão Falha Não Configurada': { en: 'Default Fault Output Not Configured', es: 'Salida Predeterminada de Falla No Configurada' },
    'Saída Padrão Alarme Não Configurada': { en: 'Default Alarm Output Not Configured', es: 'Salida Predeterminada de Alarma No Configurada' },
    'Saída Padrão Sup. Não Configurada': { en: 'Default Sup. Output Not Configured', es: 'Salida Predeterminada de Sup. No Configurada' },
    'Limpar Sensor de Fumaça': { en: 'Clean Smoke Sensor', es: 'Limpiar Sensor de Humo' },
    'Disp. em Falha': { en: 'Device in Fault', es: 'Disp. con Falla' },
    'Disp. em Falha Saída Padrão Alarme': { en: 'Device in Fault Default Alarm Output', es: 'Disp. con Falla Salida Predeterminada de Alarma' },
    'Disp. em Falha Saída Padrão Falha': { en: 'Device in Fault Default Fault Output', es: 'Disp. con Falla Salida Predeterminada de Falla' },
    'Disp. em Falha Saída Padrão Sup.': { en: 'Device in Fault Default Sup. Output', es: 'Disp. con Falla Salida Predeterminada de Sup.' },
    'Falta de Energia AC': { en: 'AC Power Failure', es: 'Falta de Energía AC' },
    'Sobretensão Fonte': { en: 'Power Supply Overvoltage', es: 'Sobretensión de la Fuente' },
    'Subtensão Fonte': { en: 'Power Supply Undervoltage', es: 'Subtensión de la Fuente' },
    'Fuga Terra Negativa': { en: 'Negative Ground Fault', es: 'Fuga a Tierra Negativa' },
    'Fuga Terra Positiva': { en: 'Positive Ground Fault', es: 'Fuga a Tierra Positiva' },
    'Saída Carregador Reserva Abaixo de 0.9V': { en: 'Backup Charger Output Below 0.9V', es: 'Salida del Cargador de Reserva Debajo de 0.9V' },
    'Desconexão Fonte de Energia Reserva': { en: 'Backup Power Supply Disconnected', es: 'Desconexión de la Fuente de Energía de Reserva' },
    'Sem Alimentação Bateria Insuficiente': { en: 'No Power Insufficient Battery', es: 'Sin Alimentación Batería Insuficiente' },
    'Falha de Sistema Comunicação Placa Laço': { en: 'System Fault Loop Board Communication', es: 'Falla de Sistema Comunicación Placa de Lazo' },
    'Falha de Sistema Comunicação Fonte': { en: 'System Fault Power Supply Communication', es: 'Falla de Sistema Comunicación Fuente' },
    'Falha de Sistema Memória Corrompida': { en: 'System Fault Corrupted Memory', es: 'Falla de Sistema Memoria Dañada' },
    'Falha de Sistema Firmware Corrompido': { en: 'System Fault Corrupted Firmware', es: 'Falla de Sistema Firmware Dañado' },
    'Falha de Sistema Memória Laço Corrompida': { en: 'System Fault Corrupted Loop Memory', es: 'Falla de Sistema Memoria de Lazo Dañada' },
    'Config. Inconsistente Conecte o Computador': { en: 'Inconsistent Config. Connect the Computer', es: 'Config. Inconsistente Conecte la Computadora' },
    'Falha Comunicação Dispositivo': { en: 'Device Communication Fault', es: 'Falla de Comunicación del Dispositivo' },
    'Falha Comunicação Saída Padrão Alarme': { en: 'Default Alarm Output Communication Fault', es: 'Falla de Comunicación Salida Predeterminada de Alarma' },
    'Falha Comunicação Saída Padrão Falha': { en: 'Default Fault Output Communication Fault', es: 'Falla de Comunicación Salida Predeterminada de Falla' },
    'Falha Comunicação Saída Padrão Sup.': { en: 'Default Sup. Output Communication Fault', es: 'Falla de Comunicación Salida Predeterminada de Sup.' },
    'Circuito Geral Aberto Dispositivo Saída Laço': { en: 'Open Circuit Loop Output Device', es: 'Circuito General Abierto Dispositivo Salida de Lazo' },
    'Circuito Aberto Saída Padrão Alarme': { en: 'Open Circuit Default Alarm Output', es: 'Circuito Abierto Salida Predeterminada de Alarma' },
    'Circuito Aberto Saída Padrão Falha': { en: 'Open Circuit Default Fault Output', es: 'Circuito Abierto Salida Predeterminada de Falla' },
    'Circuito Aberto Saída Padrão Sup.': { en: 'Open Circuit Default Sup. Output', es: 'Circuito Abierto Salida Predeterminada de Sup.' },
    'Curto-Circuito Saída Padrão Alarme': { en: 'Short Circuit Default Alarm Output', es: 'Cortocircuito Salida Predeterminada de Alarma' },
    'Curto-Circuito Saída Padrão Falha': { en: 'Short Circuit Default Fault Output', es: 'Cortocircuito Salida Predeterminada de Falla' },
    'Curto-Circuito Saída Padrão Sup.': { en: 'Short Circuit Default Sup. Output', es: 'Cortocircuito Salida Predeterminada de Sup.' },
    'Falha Acionamento Saída': { en: 'Output Activation Fault', es: 'Falla de Activación de Salida' },
    'Falha no Sistema': { en: 'System Fault', es: 'Falla en el Sistema' },
    'Dados Inconsistentes': { en: 'Inconsistent Data', es: 'Datos Inconsistentes' },
    'Falha Restaurada': { en: 'Fault Restored', es: 'Falla Restaurada' },
    'Sistema em Falha': { en: 'System in Fault', es: 'Sistema con Falla' },
    'Falha Bateria': { en: 'Battery Fault', es: 'Falla de Batería' },
    'Fonte Inicializando': { en: 'Power Supply Starting', es: 'Fuente Iniciando' },
    'Laço em Falha': { en: 'Loop in Fault', es: 'Lazo con Falla' },
    'Falha Acionamento Saída Padrão Alarme': { en: 'Default Alarm Output Activation Fault', es: 'Falla de Activación Salida Predeterminada de Alarma' },
    'Falha Acionamento Saída Padrão Falha': { en: 'Default Fault Output Activation Fault', es: 'Falla de Activación Salida Predeterminada de Falla' },
    'Falha Acionamento Saída Padrão Sup.': { en: 'Default Sup. Output Activation Fault', es: 'Falla de Activación Salida Predeterminada de Sup.' },
    'Falha de Comunicação com a Repetidora': { en: 'Repeater Communication Fault', es: 'Falla de Comunicación con la Repetidora' },
    'Falha de Comunicação com a Repetidora - Versão incompatível': { en: 'Repeater Communication Fault - Incompatible Version', es: 'Falla de Comunicación con la Repetidora - Versión incompatible' },
    'Falha Comunicação com a Central': { en: 'Fire Panel Communication Fault', es: 'Falla de Comunicación con la Central' },
    'Falha Bateria Externa': { en: 'External Battery Fault', es: 'Falla de Batería Externa' },
    'Falha Comunicação na Interligação': { en: 'Interconnection Communication Fault', es: 'Falla de Comunicación en la Interconexión' },
    'Falha Comunicação Coord. Versão diferente': { en: 'Coord. Communication Fault Different Version', es: 'Falla de Comunicación Coord. Versión diferente' },
    // Operação
    'Operação': { en: 'Operation', es: 'Operación' },
    'Reset Operação': { en: 'Operation Reset', es: 'Reinicio de Operación' },
    'Central Silenciada': { en: 'Panel Silenced', es: 'Central Silenciada' },
    'Sirene Silenciada': { en: 'Siren Silenced', es: 'Sirena Silenciada' },
    'Reativação Sirene': { en: 'Siren Reactivated', es: 'Reactivación de Sirena' },
    'Acesso Nível 2': { en: 'Level 2 Access', es: 'Acceso Nivel 2' },
    'Acesso Nível 3': { en: 'Level 3 Access', es: 'Acceso Nivel 3' },
    'Acesso Nível 4': { en: 'Level 4 Access', es: 'Acceso Nivel 4' },
    'Regra Adiada': { en: 'Rule Postponed', es: 'Regla Aplazada' },
    'Central Reiniciada': { en: 'Panel Restarted', es: 'Central Reiniciada' },
    'Sistema Iniciado': { en: 'System Started', es: 'Sistema Iniciado' },
    'Bloqueio Realizado': { en: 'Isolation Performed', es: 'Bloqueo Realizado' },
    'Conexão PC': { en: 'PC Connection', es: 'Conexión PC' },
    'Relógio Ajustado': { en: 'Clock Adjusted', es: 'Reloj Ajustado' },
    'Botão Sirene Brigada': { en: 'Brigade Siren Button', es: 'Botón Sirena Brigada' },
    'Botão Alarme Geral': { en: 'General Alarm Button', es: 'Botón Alarma General' },
    'Regra Atendida': { en: 'Rule Met', es: 'Regla Cumplida' },
    'Evento Desconhecido': { en: 'Unknown Event', es: 'Evento Desconocido' },
    'Retardo Cancelado': { en: 'Delay Canceled', es: 'Retardo Cancelado' },
    'Evento em Temp.': { en: 'Timed Event', es: 'Evento en Temp.' },
    '1/2 Regra Dupla': { en: '1/2 Double Rule', es: '1/2 Regla Doble' },
    'Regra Não Config.': { en: 'Rule Not Config.', es: 'Regla No Config.' },
    'Disp. Não Config.': { en: 'Device Not Config.', es: 'Disp. No Config.' },
    'Zona Não Config.': { en: 'Zone Not Config.', es: 'Zona No Config.' },
    'Botão Silenciar S.': { en: 'Silence S. Button', es: 'Botón Silenciar S.' },
    'Startup Executado': { en: 'Startup Executed', es: 'Arranque Ejecutado' },
    'Tempo Máximo Retardo': { en: 'Maximum Delay Time', es: 'Tiempo Máximo de Retardo' },
    'Disp. Bloqueado': { en: 'Device Isolated', es: 'Disp. Bloqueado' },
    'Disp. Desbloqueado': { en: 'Device Restored', es: 'Disp. Desbloqueado' },
    'Disp. Ativado': { en: 'Device Activated', es: 'Disp. Activado' },
    'Disp. Desativado': { en: 'Device Deactivated', es: 'Disp. Desactivado' },
    'Central Atualizada': { en: 'Panel Updated', es: 'Central Actualizada' },
    'Erro Atualização': { en: 'Update Error', es: 'Error de Actualización' },
    'Regra Temporizando': { en: 'Rule Timing', es: 'Regla Temporizando' },
    'Acionamento Regra Bloq.': { en: 'Isolated Rule Activation', es: 'Activación Regla Bloq.' },
    'Regra Bloqueada': { en: 'Rule Isolated', es: 'Regla Bloqueada' },
    'Regra Desbloqueada': { en: 'Rule Restored', es: 'Regla Desbloqueada' },
    'Zona Bloqueada': { en: 'Zone Isolated', es: 'Zona Bloqueada' },
    'Zona Desbloqueada': { en: 'Zone Restored', es: 'Zona Desbloqueada' },
    'Laço Bloqueado': { en: 'Loop Isolated', es: 'Lazo Bloqueado' },
    'Laço Desbloqueado': { en: 'Loop Restored', es: 'Lazo Desbloqueado' },
    'Senhas Resetadas': { en: 'Passwords Reset', es: 'Contraseñas Restablecidas' },
    'Disp. Removido': { en: 'Device Removed', es: 'Disp. Eliminado' },
    'Disp. Inserido': { en: 'Device Added', es: 'Disp. Insertado' },
    'Erro Comunicação Fonte': { en: 'Power Supply Communication Error', es: 'Error de Comunicación Fuente' },
    'Laço Registrado': { en: 'Loop Registered', es: 'Lazo Registrado' },
    'Configuração Padrão': { en: 'Default Configuration', es: 'Configuración Predeterminada' },
    '2/2 Regra Dupla': { en: '2/2 Double Rule', es: '2/2 Regla Doble' },
    'Regra Acionada': { en: 'Rule Triggered', es: 'Regla Activada' },
    'Gravar/Ler Disp.': { en: 'Write/Read Device', es: 'Grabar/Leer Disp.' },
    'Tempo Retardo Conf.': { en: 'Delay Time Set', es: 'Tiempo de Retardo Conf.' },
    'Regra Acionada Man.': { en: 'Rule Triggered Manually', es: 'Regla Activada Man.' },
    'Novo Modelo Central': { en: 'New Panel Model', es: 'Nuevo Modelo de Central' },
    'Dados Sistema Alterado': { en: 'System Data Changed', es: 'Datos del Sistema Modificados' },
    'Senha Nivel2 Alterada': { en: 'Level 2 Password Changed', es: 'Contraseña Nivel 2 Modificada' },
    'Senha Nivel3 Alterada': { en: 'Level 3 Password Changed', es: 'Contraseña Nivel 3 Modificada' },
    'Senha Nivel4 Alterada': { en: 'Level 4 Password Changed', es: 'Contraseña Nivel 4 Modificada' },
    'Sistema com Falha de Falta de Energia': { en: 'System with Power Failure', es: 'Sistema con Falla por Falta de Energía' },
    'Sistema em Pré Alarme': { en: 'System in Pre-Alarm', es: 'Sistema en Prealarma' },
    'Operação Remota Programador': { en: 'Remote Programmer Operation', es: 'Operación Remota del Programador' },
    // Bloqueios ativos (canal sem tabela de códigos)
    'Bloqueio ativo': { en: 'Active isolation', es: 'Bloqueo activo' },
};

const AREAS: Record<string, Translations> = {
    Garagem: { en: 'Garage', es: 'Garaje' },
    Elevador: { en: 'Elevator', es: 'Ascensor' },
    Estacionamentos: { en: 'Parking', es: 'Estacionamientos' },
    'Pressurização': { en: 'Pressurization', es: 'Presurización' },
    'Central de incêndio': { en: 'Fire panel', es: 'Central de incendios' },
};

const AREA_DETAILS: Record<string, Translations> = {
    'Módulo liga': { en: 'On module', es: 'Módulo enciende' },
    'Módulo desliga': { en: 'Off module', es: 'Módulo apaga' },
};

const eventLabel = (lang: Lang, label: string): string => {
    const unknown = label.match(/^Evento desconhecido(?: \(código (\d+)\))?$/);
    if (unknown) {
        const code = unknown[1];
        return pick(lang, label, code
            ? { en: `Unknown event (code ${code})`, es: `Evento desconocido (código ${code})` }
            : { en: 'Unknown event', es: 'Evento desconocido' });
    }
    const translation = EVENT_LABELS[label];
    return translation ? pick(lang, label, translation) : label;
};

const towerLabel = (lang: Lang, tower: string) => pick(lang, `Torre ${tower}`, { en: `Tower ${tower}`, es: `Torre ${tower}` });

const floorLabel = (lang: Lang, floor: number) => {
    if (floor === 0) return pick(lang, 'Térreo', { en: 'Ground floor', es: 'Planta baja' });
    if (floor < 0) return pick(lang, `Subsolo ${-floor}`, { en: `Basement ${-floor}`, es: `Subsuelo ${-floor}` });
    return pick(lang, `${floor}º andar`, { en: `Floor ${floor}`, es: `Piso ${floor}` });
};

type Place = {
    tower?: string | null; towerLabel?: string | null; floor?: number | null; floorLabel?: string | null;
    position?: string | null; positionLabel?: string | null; area?: string | null; areaDetail?: string | null;
};

/** Mesmo local, com os rótulos no idioma pedido (os campos estruturados não mudam). */
export const localizePlace = <T extends Place>(place: T, lang: Lang): T => {
    if (lang === 'pt-BR') return place;
    const translatedArea = place.area ? AREAS[place.area] : undefined;
    const translatedDetail = place.areaDetail ? AREA_DETAILS[place.areaDetail] : undefined;
    return {
        ...place,
        ...(place.tower ? { towerLabel: towerLabel(lang, place.tower) } : {}),
        ...(typeof place.floor === 'number' ? { floorLabel: floorLabel(lang, place.floor) } : {}),
        ...(place.position ? { positionLabel: pick(lang, `Posição ${place.position}`, { en: `Position ${place.position}`, es: `Posición ${place.position}` }) } : {}),
        ...(translatedArea ? { area: translatedArea[lang] } : {}),
        ...(translatedDetail ? { areaDetail: translatedDetail[lang] } : {}),
    };
};

const SITUATIONS: Record<string, Translations> = {
    'Central reiniciando': { en: 'Fire panel restarting', es: 'Central reiniciando' },
    'Central sem comunicação': { en: 'Fire panel offline', es: 'Central sin comunicación' },
    'Sistema em alarme': { en: 'System in alarm', es: 'Sistema en alarma' },
    'Sistema em falha': { en: 'System in fault', es: 'Sistema con falla' },
    'Sistema em supervisão': { en: 'System in supervision', es: 'Sistema en supervisión' },
    'Sistema normal': { en: 'System normal', es: 'Sistema normal' },
};

const situationLabel = (lang: Lang, label: string): string => {
    const blocked = label.match(/^Sistema normal com (\d+) bloque/);
    if (blocked) {
        const count = Number(blocked[1]);
        return pick(lang, label, {
            en: `System normal with ${count} active isolation${count > 1 ? 's' : ''}`,
            es: `Sistema normal con ${count} bloqueo${count > 1 ? 's' : ''} activo${count > 1 ? 's' : ''}`,
        });
    }
    const translation = SITUATIONS[label];
    return translation ? pick(lang, label, translation) : label;
};

type Json = unknown;
const isObject = (value: Json): value is Record<string, Json> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Percorre a resposta do nova-cie (painel, alarmes, eventos ativos, histórico)
 * e troca os rótulos interpretados pelo idioma pedido. O formato não muda.
 */
export const localizeCie = <T>(data: T, lang: Lang): T => {
    if (lang === 'pt-BR') return data;
    const walk = (value: Json): Json => {
        if (Array.isArray(value)) return value.map(walk);
        if (!isObject(value)) return value;
        const out: Record<string, Json> = {};
        for (const [key, child] of Object.entries(value)) out[key] = walk(child);
        // Evento interpretado: { category, code, label, kind, severity }.
        if (typeof out.label === 'string' && 'category' in out && 'kind' in out) out.label = eventLabel(lang, out.label);
        // Situação do painel: { state, label, severity, silenced }.
        if (typeof out.label === 'string' && 'state' in out && 'silenced' in out) out.label = situationLabel(lang, out.label);
        // Local interpretado.
        if ('towerLabel' in out && 'floorLabel' in out) return localizePlace(out as Place, lang);
        // display.title é o rótulo do evento.
        if (typeof out.title === 'string' && 'place' in out && 'deviceName' in out) out.title = eventLabel(lang, out.title);
        return out;
    };
    return walk(data) as T;
};
