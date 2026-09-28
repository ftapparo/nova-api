-- =============================================================================
-- Migração 001: tabelas para user-settings e push-subscriptions
--
-- Substituem os arquivos .json em disco usados por
-- API/src/repositories/user-settings.repository.ts e
-- push-subscription.repository.ts. Formato das colunas espelha exatamente
-- os tipos hoje gravados nesses arquivos (ver normalizeStoredData/
-- normalizeItem em cada repositório).
--
-- Rodar como nova_api_app (dono do schema public) ou nova_app (superuser).
-- =============================================================================

-- user-settings: hoje 1 arquivo por usuário (ex: storage/user-settings/joao.json)
-- contendo { user, updatedAt, items: Record<string,string> }.
CREATE TABLE IF NOT EXISTS user_settings (
    user_id     TEXT PRIMARY KEY,
    items       JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- push-subscriptions: hoje 1 arquivo por usuário contendo um array de
-- inscrições (uma por endpoint/dispositivo). Aqui, 1 linha por endpoint —
-- é a chave real de deduplicação usada no código atual (dedup por
-- item.endpoint dentro de normalizeStoredData).
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           TEXT NOT NULL,
    endpoint          TEXT NOT NULL UNIQUE,
    expiration_time   BIGINT,
    p256dh            TEXT NOT NULL,
    auth              TEXT NOT NULL,
    ua                TEXT,
    platform          TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Toda consulta por usuário (ex: listar/apagar inscrições dele) filtra por
-- user_id — índice evita full scan à medida que a tabela cresce.
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions (user_id);
