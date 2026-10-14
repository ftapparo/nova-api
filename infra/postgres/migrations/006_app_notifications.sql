-- =============================================================================
-- Migração 006: push nativo do app (FCM no Android; iOS reservado)
--
-- Mecanismo novo e separado do Web Push do painel (push_subscriptions, 001):
--   notification_device      aparelhos do app, um por instalação, com o token
--                            FCM e a foto do público (papel e morador ativo)
--                            usada para escolher os destinatários sem consultar
--                            o Firebird no momento de um alarme.
--   notification_preference  preferências por conta; sem linha = padrões. O
--                            alarme de incêndio não é desligável aqui (o
--                            controle é do canal no próprio aparelho).
--   notification_dispatch    um registro por aviso lógico; dedupe_key impede
--                            repetir o mesmo aviso, inclusive após reiniciar
--                            a API.
--   exhaust_activation       dono do ciclo atual de cada exaustor: a conta do
--                            último ligar/reiniciar pelo app. Só ela recebe o
--                            "faltam X minutos" e o "desligado".
--   condo_message.notify     comunicado gera push (decisão de 13/10/2026, que
--                            substitui "comunicado não gera push"). Os já
--                            existentes ficam false para não disparar no deploy.
--
-- Rodar como nova_api_app (dono do schema public).
-- =============================================================================

CREATE TABLE IF NOT EXISTS notification_device (
    id BIGSERIAL PRIMARY KEY,
    account_id UUID NOT NULL,                 -- auth.users.id. Sem FK: nova_api_app não acessa o schema auth.
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
    installation_id UUID NOT NULL,            -- gerado pelo app na instalação; estável entre trocas de token
    token TEXT NOT NULL,                      -- token FCM do aparelho
    app_version TEXT,
    os_version TEXT,
    device_model TEXT,
    notifications_enabled BOOLEAN NOT NULL DEFAULT true,  -- permissão do sistema, informada pelo app
    alarm_channel_enabled BOOLEAN NOT NULL DEFAULT true,  -- canal do alarme de incêndio não bloqueado
    role TEXT,                                -- papel da conta no último registro (porteiro|sindico|admin|morador|null)
    resident_active BOOLEAN NOT NULL DEFAULT false,       -- morador com unidade liberada na última conferência
    audience_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    invalidated_at TIMESTAMPTZ,               -- FCM respondeu que o token não vale mais
    UNIQUE (platform, installation_id),
    UNIQUE (token)
);
CREATE INDEX IF NOT EXISTS notification_device_account_idx
    ON notification_device (account_id) WHERE invalidated_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_preference (
    account_id UUID PRIMARY KEY,              -- auth.users.id. Sem FK
    exhaust_expiring BOOLEAN NOT NULL DEFAULT true,
    exhaust_off BOOLEAN NOT NULL DEFAULT true,
    messages BOOLEAN NOT NULL DEFAULT true,
    cie_staff_alerts BOOLEAN NOT NULL DEFAULT true,  -- só tem efeito para a equipe
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_dispatch (
    id BIGSERIAL PRIMARY KEY,
    kind TEXT NOT NULL,                       -- ex.: cie.alarm, exhaust.expiring, message.published
    dedupe_key TEXT NOT NULL UNIQUE,
    audience TEXT NOT NULL,                   -- descrição curta do público (staff, staff+residents, account)
    target_count INTEGER NOT NULL DEFAULT 0,  -- aparelhos selecionados
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_dispatch_kind_idx
    ON notification_dispatch (kind, created_at DESC);

CREATE TABLE IF NOT EXISTS exhaust_activation (
    exhaust_id TEXT PRIMARY KEY,              -- 'A4'
    account_id UUID NOT NULL,                 -- auth.users.id. Sem FK
    expires_at TIMESTAMPTZ,                   -- expiresAt do ciclo; diferente do atual = ciclo de outro (painel v2)
    activated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE condo_message ADD COLUMN IF NOT EXISTS notify BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE condo_message ALTER COLUMN notify SET DEFAULT true;
