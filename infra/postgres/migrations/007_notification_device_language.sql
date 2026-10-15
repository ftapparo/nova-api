-- =============================================================================
-- Migração 007: idioma do aparelho para o push (tradução do app, item 3.1)
--
-- O app passa a enviar `language` (pt-BR | en | es) no registro do aparelho e
-- o push sai com o texto nesse idioma. Aparelhos já registrados, e apps sem o
-- campo, ficam em português.
--
-- Rodar como nova_api_app (dono do schema public).
-- =============================================================================

ALTER TABLE notification_device
    ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'pt-BR'
        CHECK (language IN ('pt-BR', 'en', 'es'));
