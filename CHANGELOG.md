# Changelog - nova-api

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [Unreleased]

### Adicionado
- Esqueleto da v3 (`src/v3/`): servidor Fastify + Zod rodando lado a lado com a v2 (Express) no mesmo processo, porta própria (`PORT_V3`, padrão `3031`). Endpoints `GET /v3/api/health` e `/v3/api/healthcheck` (mesmo par de rotas da v2) validam o padrão de resposta tipado com Zod. Falha ao iniciar a v3 não derruba a v2. Ainda não expõe nenhuma rota de negócio nem exige autenticação.
- Swagger/OpenAPI na v3, atrás de flag própria `SWAGGER_V3_ENABLED` (independente da `SWAGGER_ENABLED` da v2) — ligada durante o desenvolvimento ativo da v3, desligar quando ela for para produção de verdade. Interface em `/v3/swagger`, spec em `/v3/apispec_1.json`. Spec **escrito à mão** em `src/v3/openapi.json` (não gerado a partir dos schemas Zod — a geração automática do `@fastify/swagger` ficou pobre demais: sem `summary`/`description` reais, `pagination` aparecendo em endpoints sem paginação, exemplos sem sentido), servido via `@fastify/swagger` em `mode: 'static'` + `@fastify/swagger-ui`. Mesmo padrão que a v2 já usa com `swagger.json` mantido manualmente.
- Modelo de resposta padrão da v3 (`src/v3/shared/response.ts`, `src/v3/shared/reply-helpers.ts`): envelope de sucesso `{ success, data, meta }` (com `timestamp`/`requestId`/`version` sempre presentes, `pagination` só quando o endpoint pagina) e envelope de erro no formato RFC 7807 adaptado (`{ success, error: { type, title, status, detail, instance, validationErrors? }, meta }`). Mecanismo `reply.ok()`/`reply.fail()` decorado no Fastify; erros de validação Zod, exceções não tratadas e 404 de rota são capturados automaticamente pelo error handler global e saem no mesmo envelope. Documentação completa em `docs/PADRAO-RESPOSTA-V3.md` (raiz do workspace) — vale para os 3 backends quando TAG e CIE escreverem sua v3.
- Rotas de proxy para `nova-tag` (`GET /v3/api/tag/gate/state`, `/v3/api/tag/cache`) e `nova-cie` (`GET /v3/api/cie/status`, `/panel`, `/alarms/active`, `/logs`, `/counters/blocks`, `/counters/outputs`), reaproveitando as rotas v3 já migradas nesses projetos. `src/v3/shared/service-proxy.ts` centraliza a chamada HTTP autenticada por token de serviço (`TAG_SERVICE_TOKEN`, `CIE_SERVICE_TOKEN`) e a remontagem no envelope de resposta da própria API. A v3 da API ainda não exige autenticação de usuário — isso vem numa etapa posterior, com Supabase Auth.

- Autenticação de usuário na v3 via Supabase Auth (GoTrue, container `nova-auth`): `POST /v3/api/auth/login`, `/auth/refresh`, `/auth/logout` e `GET /v3/api/auth/me` (`src/v3/auth/`). A API continua sendo a única porta de entrada — o GoTrue não é exposto. Access token (15 min) validado localmente em `src/v3/shared/require-auth.ts` (HS256 com `AUTH_JWT_SECRET`, algoritmo fixado, assinatura em tempo constante, `exp` e `aud` checados), sem dependência nova. Papel da aplicação (`morador`/`portaria`/`sindico`/`admin`/`servico`) lido de `app_metadata.role`. Erros de autenticação são genéricos, sem revelar se o e-mail existe.
- Rotas de TAG e CIE da v3 passam a exigir `Authorization: Bearer <accessToken>` (hook `enforceAuth` no escopo protegido de `v3/server.ts`). Flag temporária `AUTH_ENFORCE=false` libera requisições sem token durante o corte (registrando aviso no log); padrão é exigir. A v2 não foi alterada.
- Cadastro público do morador: `POST /v3/api/auth/signup` cria a conta com papel `morador` (o papel nunca vem do cliente) e já devolve a sessão. Versão básica — ainda não confere o cadastro no Firebird. O signup nativo do GoTrue continua desligado: a API cria a conta pela API admin (JWT `service_role` de 60 s, gerado sob demanda).
- Criação de conta por admin: `POST /v3/api/auth/users` (qualquer papel, exige `admin`). O primeiro admin é criado pelo signup normal e promovido direto no banco (`auth.users.raw_app_meta_data`).
- Limite de tentativas nas rotas públicas de autenticação (`src/v3/auth/auth.rate-limit.ts`, em memória, sem dependência nova): login com 20 tentativas por IP e 5 falhas por e-mail a cada 15 min (login certo zera as falhas do e-mail); signup com 5 por IP por hora, contando também e-mail repetido. Resposta `429` com `Retry-After`. IP real via `CF-Connecting-IP` (mesma regra da v2). Necessário porque o limite do próprio GoTrue enxerga só a nova-api como cliente.
- Vínculo da conta com o cadastro do condomínio (`src/v3/residence/`, `core/repositories/residence.repository.ts`, migração `002_account_person_link.sql`). Admin vincula manualmente a conta a `PESSOAS.SEQUENCIA` (`PUT`/`DELETE /v3/api/residence/links/:accountId`, `GET /residence/links`) — não é inferido pelo CPF, que não é segredo. `GET /v3/api/residence/me` devolve o estado (`pendente`/`ativo`/`sem-unidade`), as unidades com `blocked`/`blockedReason` e um `blocked` geral para o app desativar tudo. Regras (estritas, para forçar a correção de cadastros inconsistentes): exige `MOR='S'`; só locatário libera; só proprietário libera se a unidade não tiver outro locatário (lei do inquilinato); `PROP` e `LOC` juntos ou nenhum dos dois bloqueia (`cadastro-inconsistente`); titularidade ignorada; ligação removida no Firebird some da lista. Situação lida do Firebird com cache de 2 min — o login nunca depende dela.
- `GET /v3/api/auth/users` (admin): lista as contas para achar quem se cadastrou.
- Novas variáveis: `AUTH_URL`, `AUTH_JWT_SECRET`, `AUTH_TIMEOUT_MS`, `AUTH_ENFORCE` (listadas no `docker-compose.yml`). `openapi.json` documenta as rotas de auth e o esquema `bearerAuth` nas rotas protegidas.

### Corrigido
- `nova-auth` (GoTrue) falhava em runtime com `relation "identities" does not exist` — todo signup/login pela v3 retornava 503. `GOTRUE_DB_NAMESPACE=auth` só vale para as migrações; em runtime o GoTrue consulta tabelas sem schema e depende do `search_path` do role. `infra/postgres/setup-roles.sql` agora aplica `ALTER ROLE supabase_auth_admin SET search_path = auth` (exige restart do `nova-auth`). Em instalação que já rodava sem ele, sincronizar `auth.schema_migrations` a partir de `public.schema_migrations` antes — senão o GoTrue reaplica migrações já feitas e entra em crash loop (SQL no próprio script).
- Bug de leitura de variável de ambiente antes de `dotenv.config()` rodar: `TAG_SERVICE_TOKEN`/`CIE_SERVICE_TOKEN` eram lidos numa `const` no topo dos módulos de rota, capturando sempre `undefined` (imports resolvem antes do `.env` carregar). Corrigido lendo cada variável dentro de uma função, chamada no momento do uso.

### Alterado
- Signup da v3 não atribui mais o papel `morador`: a conta nasce sem papel e fica `pendente` até ser vinculada ao cadastro do condomínio. `app_metadata.role` fica para papéis de equipe (`portaria`, `sindico`, `admin`, `servico`).

### Alterado
- Estrutura de `src/v3/` reorganizada por feature, seguindo `AI-Friendly Architecture Specification.md` (raiz do workspace): `routes/` e `lib/` (organização por camada técnica) viraram `health/`, `tag/`, `cie/` (uma pasta por feature, com `<feature>.routes.ts` + `<feature>.schema.ts` quando aplicável) e `shared/` (só o que é genuinamente transversal: `response.ts`, `reply-helpers.ts`, `service-proxy.ts`). Sem mudança de comportamento — validado localmente contra o servidor real, mesmas respostas de antes.

### Alterado
- Reorganização estrutural do código: `services/`, `repositories/` e `utils/` movidos para `src/core/` (lógica de negócio e integrações, sem framework HTTP); `controllers/`, `routes/`, `middleware/` e `api/` movidos para `src/v2/` (camada Express atual). Preparação para uma futura v3 (pensada para consumo mobile), que reaproveitará tudo em `core/` sem duplicar lógica já validada em produção. Sem mudança de comportamento.

## [2.0.0] - 2026-09-28

### Adicionado
- Migração de `user-settings` e `push-subscriptions` de arquivos `.json` para tabelas PostgreSQL (`user_settings`, `push_subscriptions`), usando a role dedicada `nova_api_app`. Repositórios reescritos mantendo a mesma interface pública; script de migração (`src/scripts/migrate-json-to-postgres.ts`) rodado uma vez em produção, sem apagar os arquivos originais na hora.
- Infraestrutura de Postgres + Supabase Auth (GoTrue) self-hosted via Docker, com backup diário (`pg_dump`) e sincronização para Google Drive via `rclone`. Restauração completa testada em ambiente isolado antes de confiar no backup.
- CORS restrito por lista branca, rate limiting em memória com múltiplos buckets (geral, polling, comandos) e headers de segurança tipo helmet.
- Suporte a notificações Web Push (VAPID): inscrição, remoção, envio genérico e evento semântico de alarme de incêndio, com limpeza automática de inscrições inválidas.

### Corrigido
- Rate limit de comando aplicado incorretamente a rotas `GET` de status, causando `429` falso em uso normal do painel.
- Polling do dashboard competindo pelo mesmo bucket de rate limit do restante da API — isolado em bucket próprio e mais generoso.
- `env_file`/`COPY .env` removidos do Dockerfile e do `docker-compose.yml`: incompatíveis com stack Git-based do Portainer (o `.env` real não é versionado).

## [1.x] - anterior a 2026

Histórico anterior não documentado neste formato. Principais marcos reconstituídos do histórico de commits:

- Gateway HTTP para a central de incêndio (nova-cie): consulta de status, painel, contadores, logs e comandos (silenciar, liberar, reiniciar, sirenes).
- Consulta de veículos por placa com fallback em cascata entre três fontes (scraping KePlaca, scraping PlacaFipe, WDAPI paga).
- Integração com o ERP Freedom PROANSI via Firebird: controle de acesso, portões, portas, exaustores de churrasqueira.
