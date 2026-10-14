-- =============================================================================
-- Migração 005: permanência dos comunicados no carrossel da home do app
--
-- O carrossel mostra os comunicados por um tempo limitado (TTL), contado da
-- publicação; a lista de Mensagens não muda (segue published/expires/archived).
--   carousel_ttl_hours > 0: sai do carrossel depois desse número de horas.
--   carousel_ttl_hours = 0: sai do carrossel de cada conta quando ela o lê.
--   pinned: fica no carrossel até o síndico desafixar. Fixado tem TTL 0, então
--           ao desafixar sai para quem já leu e, para quem não leu, ao ler.
-- Comunicados já existentes recebem o padrão de 24 h.
--
-- Rodar como nova_api_app (dono do schema public).
-- =============================================================================

ALTER TABLE condo_message
    ADD COLUMN IF NOT EXISTS carousel_ttl_hours INTEGER NOT NULL DEFAULT 24
        CHECK (carousel_ttl_hours BETWEEN 0 AND 720),
    ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE condo_message DROP CONSTRAINT IF EXISTS condo_message_pinned_ttl_zero;
ALTER TABLE condo_message
    ADD CONSTRAINT condo_message_pinned_ttl_zero CHECK (NOT pinned OR carousel_ttl_hours = 0);
