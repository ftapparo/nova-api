-- =============================================================================
-- Migração 003: comunicados do condomínio (app Android, telas 08d, 17 e 18)
--
-- A administração (síndico/admin) publica; moradores com unidade liberada e
-- a equipe leem. A leitura é registrada por conta, para o contador do sino e
-- o filtro "Não lidas". Comunicado não gera push: morador só recebe push de
-- alarme de incêndio (decisão de 13/10/2026).
--
-- Rodar como nova_api_app (dono do schema public).
-- =============================================================================

CREATE TABLE IF NOT EXISTS condo_message (
    id              BIGSERIAL PRIMARY KEY,
    category        TEXT NOT NULL CHECK (category IN ('manutencao', 'comunicado', 'aviso', 'urgente')),
    -- Etiqueta livre do cartão e do detalhe (ex.: "Manutenção programada").
    -- Nula: o app mostra o nome da categoria.
    label           TEXT,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    -- Data futura agenda a publicação; o comunicado só aparece a partir dela.
    published_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Some da lista depois desta data (ex.: manutenção já concluída).
    expires_at      TIMESTAMPTZ,
    -- auth.users.id. Sem FK: nova_api_app não acessa o schema auth.
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Arquivado (excluído pela administração): preservado para histórico.
    archived_at     TIMESTAMPTZ,
    archived_by     UUID
);

CREATE INDEX IF NOT EXISTS condo_message_visible_idx
    ON condo_message (published_at DESC)
    WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS condo_message_read (
    message_id      BIGINT NOT NULL REFERENCES condo_message (id) ON DELETE CASCADE,
    account_id      UUID NOT NULL,
    read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, account_id)
);
