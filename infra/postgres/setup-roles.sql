-- =============================================================================
-- Setup de roles isolados por privilégio mínimo
--
-- Rodar UMA VEZ, conectado como nova_app (é superusuário — herdado do
-- POSTGRES_USER da inicialização do container oficial).
--
-- Como rodar (com o WARP ligado):
--   psql -h 192.168.0.250 -U nova_app -d nova_residence -f setup-roles.sql
--
-- Resultado — três papéis, cada um só vê o que precisa:
--
--   nova_app             → superusuário. Uso administrativo pontual seu
--                           (migrações manuais, debug). NÃO usar em código.
--   nova_api_app         → dono do schema "public" (tabelas da aplicação:
--                           user_settings, push_subscriptions, command_log).
--                           É o que a nova-api usa em produção.
--   supabase_auth_admin  → dono do schema "auth". GOTRUE_DB_NAMESPACE=auth
--                           FUNCIONA como esperado — confirmado pelo log de
--                           migração criando auth.schema_migrations,
--                           auth.users, auth.refresh_tokens etc.
--
--                           Correção 1 (25/09/2026): a migração de RLS do
--                           GoTrue (20240612123726_enable_rls_update_grants)
--                           dá GRANT a um role chamado "postgres", que não
--                           existe neste cluster (usamos nova_app como
--                           superusuário, não "postgres" — diferença de não
--                           usar a imagem supabase/postgres, que sempre cria
--                           esse role). Erro: "role postgres does not exist".
--                           Corrigido criando um role postgres NOLOGIN,
--                           só como alvo desses GRANTs internos — ver seção 3.
--
--                           GRANT ALL ON SCHEMA public TO supabase_auth_admin
--                           foi aplicado em 25/09/2026 como tentativa anterior
--                           a esta descoberta, e REVOGADO em 27/09/2026 depois
--                           de confirmar (via psql + restart do container)
--                           que o GoTrue segue healthy sem ele. Isolamento de
--                           schema entre auth e public alcançado por completo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Role de aplicação para a nova-api — SEM superusuário, sem CREATEROLE.
-- ---------------------------------------------------------------------------
CREATE ROLE nova_api_app
    NOSUPERUSER
    NOCREATEROLE
    NOCREATEDB
    LOGIN
    NOREPLICATION
    PASSWORD '__SENHA_NOVA_API_APP__';

-- Schema "public" já existe (padrão do banco). Transfere posse para o
-- role de aplicação, para que ele possa criar/alterar tabelas nele.
ALTER SCHEMA public OWNER TO nova_api_app;

-- Garante que tabelas futuras criadas por nova_api_app fiquem acessíveis
-- para ele mesmo (comportamento padrão, mas explícito por clareza).
GRANT ALL ON SCHEMA public TO nova_api_app;

-- CONNECT no banco não é implícito em GRANT CREATE/ALL ON SCHEMA — precisa
-- ser concedido à parte. Sem isto, a conexão falha com
-- "permission denied for database" mesmo com a senha correta.
-- (Erro real cometido e corrigido em 25/09/2026 — ver CHECKLIST.md.)
GRANT CONNECT ON DATABASE nova_residence TO nova_api_app;

-- ---------------------------------------------------------------------------
-- 2. Role dedicado ao GoTrue (Supabase Auth) — isolado no schema "auth".
-- ---------------------------------------------------------------------------
CREATE ROLE supabase_auth_admin
    NOSUPERUSER
    CREATEROLE
    NOCREATEDB
    LOGIN
    NOREPLICATION
    PASSWORD '__SENHA_SUPABASE_AUTH_ADMIN__';

GRANT CREATE ON DATABASE nova_residence TO supabase_auth_admin;

-- CONNECT não é implícito em GRANT CREATE — precisa ser concedido à parte.
-- Sem isto, o GoTrue falha ao iniciar com "permission denied for database"
-- mesmo com a senha e o host corretos (erro real cometido e corrigido em
-- 25/09/2026 — ver CHECKLIST.md).
GRANT CONNECT ON DATABASE nova_residence TO supabase_auth_admin;

-- O GoTrue NÃO cria o schema "auth" sozinho por padrão nesta config —
-- isso só acontece automaticamente no compose oficial do Supabase porque a
-- imagem "supabase/postgres" já vem com scripts de bootstrap que criam
-- "auth" e os demais schemas de fábrica. Com postgres:16 genérico (nossa
-- escolha, para não herdar a stack completa), sem GOTRUE_DB_NAMESPACE
-- explícito o GoTrue tenta usar "public" e falha com
-- "permission denied for schema public" (erro real cometido e corrigido
-- em 25/09/2026 — ver CHECKLIST.md). Criar o schema manualmente:
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;

-- No compose do serviço auth (infra/auth/docker-compose.yml):
--   GOTRUE_DB_NAMESPACE: auth
-- Funciona corretamente — GoTrue cria e usa o schema "auth" de fato.

-- CREATEROLE aqui é necessário porque o GoTrue cria roles internos
-- (ex: authenticated, anon) na primeira inicialização, dependendo da
-- versão. Se a versão usada não precisar, pode ser restringido depois
-- para NOCREATEROLE — testar após a primeira subida.

-- Role "postgres" NOLOGIN, exigido por uma migração interna do GoTrue
-- (20240612123726_enable_rls_update_grants), que concede SELECT nas
-- tabelas de auth a um role chamado "postgres" — presumindo o padrão do
-- compose oficial do Supabase (imagem supabase/postgres sempre cria esse
-- role). Nosso cluster usa nova_app como superusuário, não "postgres",
-- então o role precisou ser criado manualmente, vazio, só como alvo desses
-- GRANTs. NOLOGIN: ninguém autentica com ele, existe só para a migração
-- não falhar com "role postgres does not exist".
CREATE ROLE postgres NOLOGIN;

-- ---------------------------------------------------------------------------
-- 3. Isolamento entre os dois roles de serviço — ALCANÇADO E CONFIRMADO.
--
--    nova_api_app não tem qualquer acesso a "auth". supabase_auth_admin não
--    tem qualquer acesso a "public" (o GRANT ALL aplicado em 25/09/2026 como
--    tentativa anterior à descoberta do problema real — role "postgres"
--    ausente — foi REVOGADO em 27/09/2026, depois de confirmar que o
--    GoTrue continua healthy sem ele; ver CHECKLIST.md).
--
--    Verificado via psql em 27/09/2026:
--      - pg_namespace.nspacl de "public" não lista mais supabase_auth_admin
--      - SELECT count(*) FROM auth.users segue funcionando
--      - Container nova-auth voltou a healthy após o restart
--
-- ⚠️ IMPORTANTE sobre ordem: esta seção precisa rodar DEPOIS dos
--    GRANT CONNECT acima, nunca antes. REVOKE ALL ON DATABASE ... FROM
--    PUBLIC remove o CONNECT implícito que todo role herdaria de PUBLIC —
--    qualquer role novo criado depois deste script, sem um GRANT CONNECT
--    explícito, ficará com o mesmo erro "permission denied for database"
--    que tivemos aqui. Ao criar um role de serviço novo no futuro, sempre
--    conceder CONNECT explicitamente, nunca assumir que virá por herança.
-- ---------------------------------------------------------------------------
REVOKE ALL ON DATABASE nova_residence FROM PUBLIC;

-- Nada a conceder aqui: supabase_auth_admin fica só com o schema "auth"
-- (seção 2) e nova_api_app só com "public" (seção 1). Isolamento completo.
