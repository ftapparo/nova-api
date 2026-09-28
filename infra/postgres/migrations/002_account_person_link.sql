-- =============================================================================
-- Migração 002: vínculo entre conta de login e cadastro de pessoa no Firebird
--
-- Conta (Supabase Auth, auth.users.id) ↔ PESSOAS.SEQUENCIA do ERP. O vínculo
-- é feito manualmente por um admin — não é inferido pelo CPF, que não é
-- segredo e permitiria a qualquer um reivindicar o cadastro de outra pessoa
-- (decisão de 28/09/2026).
--
-- Só o vínculo mora aqui. Unidade, tipo de ligação (morador, proprietário,
-- locatário) e nome continuam no Firebird, fonte de verdade — consultados
-- sob demanda, para refletir sozinhos quando o zelador altera o cadastro.
--
-- Rodar como nova_api_app (dono do schema public).
-- =============================================================================

CREATE TABLE IF NOT EXISTS account_person_link (
    -- auth.users.id. Sem FK de propósito: nova_api_app não tem acesso ao
    -- schema auth (isolamento entre os schemas, ver setup-roles.sql).
    account_id      UUID PRIMARY KEY,
    -- PESSOAS.SEQUENCIA no Firebird. UNIQUE: uma pessoa, uma conta.
    person_seq      INTEGER NOT NULL UNIQUE,
    linked_by       UUID NOT NULL,
    linked_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
