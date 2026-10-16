-- =============================================================================
-- Migração 008: registro de atividades (auditoria) da v3
--
-- Uma linha por ação de escrita (POST/PUT/PATCH/DELETE) na v3, inclusive as
-- rotas públicas de autenticação, e por evento de segurança com motivo
-- (ex.: tentativa de vínculo automático por CPF e celular). Leituras (GET)
-- não entram: o app consulta central e exaustor a cada poucos segundos.
--
-- Nunca guarda CPF, celular, senha, token, código, localização nem conteúdo
-- de comunicado: só identificadores (conta, pessoa, exaustor) e o resultado.
-- Retenção definida na API (AUDIT_RETENTION_DAYS, padrão 365 dias).
--
-- Rodar como nova_api_app (dono do schema public).
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_event (
    id           BIGSERIAL PRIMARY KEY,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- auth.users.id. Sem FK: nova_api_app não acessa o schema auth.
    account_id   UUID,
    actor_role   TEXT,                       -- papel da conta ou "servico:<nome>"
    action       TEXT NOT NULL,              -- "POST /v3/api/exhausts/:id/on" ou evento ("residence.self_link.check")
    target       JSONB,                      -- parâmetros da rota (ex.: {"id": "A4"})
    outcome      TEXT NOT NULL,              -- ok | denied | rejected | rate_limited | error | motivo do evento
    http_status  SMALLINT,
    request_id   TEXT,
    ip           INET,
    app_version  TEXT,
    details      JSONB                       -- só ids e motivos, nunca dado pessoal
);
CREATE INDEX IF NOT EXISTS audit_event_occurred_idx ON audit_event (occurred_at);
CREATE INDEX IF NOT EXISTS audit_event_account_idx ON audit_event (account_id, occurred_at) WHERE account_id IS NOT NULL;
