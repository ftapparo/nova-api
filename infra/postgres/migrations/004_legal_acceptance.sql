-- =============================================================================
-- Migração 004: aceite do Termo de Uso (app Android/iOS)
--
-- Prova de qual versão do Termo cada conta aceitou, quando e por qual canal.
-- O sha256 é do PDF oficial (legal/termo-de-uso/<versão>.pdf), calculado pela
-- API — nunca informado pelo cliente. Só recebe INSERT: nada é atualizado nem
-- apagado, para servir de prova. A Política de Privacidade é informada, não
-- aceita (item 1.3 da própria Política), por isso não entra aqui.
--
-- Rodar como nova_api_app (dono do schema public).
-- =============================================================================

CREATE TABLE IF NOT EXISTS legal_acceptance (
    id              BIGSERIAL PRIMARY KEY,
    -- auth.users.id. Sem FK: nova_api_app não acessa o schema auth.
    account_id      UUID NOT NULL,
    document        TEXT NOT NULL CHECK (document IN ('termo-de-uso')),
    version         TEXT NOT NULL,
    sha256          CHAR(64) NOT NULL,
    accepted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    channel         TEXT NOT NULL CHECK (channel IN ('signup', 'google', 'apple', 'app')),
    ip              INET,
    user_agent      TEXT,
    UNIQUE (account_id, document, version)
);
