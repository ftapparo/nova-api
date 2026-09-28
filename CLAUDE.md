# nova-api

API principal do Condomínio Nova Residence. Integra o ERP Freedom PROANSI (Firebird) com controle de acesso físico (portões, portas, veículos), exaustores, gateway para a central de incêndio (`nova-cie`), push notifications e configurações de usuário. Consumida pelo painel administrativo (`FRONT`) e, futuramente, por apps mobile.

Veja `README.md` para a visão completa (arquitetura, endpoints, variáveis de ambiente) e `CHANGELOG.md` para o histórico. Este arquivo é o contexto real do projeto; `AGENTS.md` tem as regras genéricas de processo/arquitetura (cohesion, boundaries, validation) — leia os dois, começando por este.

## 🔴 Regra absoluta: nunca tocar em `src/v2/`

Nunca editar, refatorar ou "atualizar para usar a v3" nenhum arquivo em `src/v2/`, em nenhuma circunstância — nem para fechar uma cadeia de segurança, nem como parte de outra tarefa. `v2/` é a superfície em produção real, atendendo o condomínio agora. Qualquer trabalho de v3 que pareça exigir mudança na v2 para funcionar deve parar e perguntar antes, nunca assumir que está autorizado. Vale para os 4 projetos do ecossistema, não só este.

## Commits

Este projeto usa um fluxo de commit específico — ver skill `commit` (`.claude/skills/commit/SKILL.md`). Resumo: separar commits por grupo lógico de mudança, mensagem com subject curto + corpo completo, atualizar `CHANGELOG.md` (seção `[Unreleased]`) antes do commit, apresentar para aprovação antes de commitar, perguntar antes de dar push. Nunca criar versão numerada nem tocar no `package.json` sem pedido explícito de "versionar".

## Arquitetura

```
src/
  core/         # lógica de negócio, sem framework HTTP — reaproveitável por qualquer camada de API
    services/   # firebird, exhaust, access-control, push, vehicle-lookup, command-log
    repositories/  # Firebird (queries) e Postgres (user-settings, push-subscriptions)
    utils/      # logger, pool de conexão Postgres

  v2/           # API REST atual (Express) — não mexer na lógica de negócio aqui, só na camada HTTP
    api/, controllers/, routes/, middleware/

  scripts/      # scripts avulsos (ex.: migrate-json-to-postgres.ts)
  server.ts     # entry point: inicializa core (Firebird, exaustores, controle de acesso) e a v2
```

**Regra importante**: `core/` nunca deve importar nada de Express ou de `v2/`. A v3 (Fastify + Zod, para mobile) roda lado a lado com a v2 no mesmo processo, reaproveitando tudo em `core/` sem duplicar lógica. Trabalho em andamento na branch `nova-versao`.

### `v3/` — organizada por feature, não por camada

```
v3/
  health/         health.routes.ts
  auth/           auth.routes.ts, auth.schema.ts, auth.service.ts — signup/login/refresh/logout/me e criação de conta por admin, delegando ao Supabase Auth (nova-auth)
  tag/            tag.routes.ts, tag.schema.ts — proxy autenticado para nova-tag
  cie/            cie.routes.ts, cie.schema.ts — proxy autenticado para nova-cie
  shared/         response.ts, reply-helpers.ts (envelope de resposta), service-proxy.ts (chamada autenticada a TAG/CIE), require-auth.ts (validação local do JWT do usuário, hooks requireAuth/requireRole/enforceAuth)
  openapi.json    spec escrito à mão, não gerado
  server.ts       bootstrap do Fastify, porta própria (PORT_V3)
```

Rotas de negócio da v3 são registradas no escopo protegido de `v3/server.ts` (hook `enforceAuth`) — rota nova ali já nasce exigindo token. Só `health/` e `auth/` ficam no escopo público. Ao criar uma rota nova: schema só entra em `shared/` se for usado por 2+ features; senão fica junto da própria feature. Nunca criar `lib/`/`utils/` genérico. Padrão completo (envelope de resposta, autenticação de serviço, convenção de pastas): `docs/PADRAO-RESPOSTA-V3.md` (raiz do workspace) e `AI-Friendly Architecture Specification.md` (raiz do workspace, racional da estrutura por feature). Ler só quando a tarefa envolver `v3/` — não carregar por padrão.

## Stack

Node.js 20 + TypeScript, Express (v2), `node-firebird` (ERP), `pg` (Postgres), `web-push`, Puppeteer (scraping fallback), Winston (logs), Swagger.

## Comandos

```bash
npm run build   # tsc
npm start       # node dist/server.js
npm run dev     # hot reload, usa .env.dev
npx tsc --noEmit   # checar compilação sem gerar arquivos
```

Não há suíte de testes automatizados neste projeto ainda — validação é manual (build limpo + teste funcional local ou contra o servidor via VPN).

## Persistência — dois bancos, propósitos diferentes

- **Firebird** (`FIREBIRD_*`): dado operacional do condomínio (moradores, veículos, histórico de acesso). É o ERP legado, fonte de verdade — não fazer suposições sobre schema sem checar `core/repositories/`.
- **PostgreSQL** (`nova-postgres`, `POSTGRES_*`/`NOVA_API_APP_*`): só `user_settings` e `push_subscriptions`. Acessado pela role `nova_api_app`, que só tem privilégio no schema `public` — nunca vai ter acesso ao schema `auth` (usado pelo Supabase Auth/GoTrue, serviço separado). Ver `infra/postgres/` para os composes e SQL de setup.

## Convenções

- Toda rota v2 fica sob `/v2/api`. Ao adicionar uma rota, seguir o padrão dos `routes/*.routes.ts` existentes (Router do Express, sem lógica — delega pro controller).
- Rotas que acionam hardware físico (portão, exaustor, comandos CIE) ou enviam notificações passam pelo rate limit de comando (`commandsOnly()` em `middleware/security.ts`), não o geral.
- Rotas de status consultadas em polling pelo painel (ex.: `/control/status`) devem entrar em `POLLING_PATHS` (`v2/api/web-server.api.ts`) para não competir com o rate limit geral — isso já causou um incidente de 429 falso-positivo, documentado no código.
- Nunca commitar `.env` real nem segredos. `env_file`/`COPY .env` foram removidos de propósito do Dockerfile/compose — o Portainer roda stacks Git-based e injeta variáveis diretamente.
- Ao mexer em `core/repositories/*.repository.ts` do Postgres, manter a mesma interface pública dos métodos exportados — os controllers em `v2/` dependem dela sem saber se por trás é arquivo, Postgres ou outra coisa.

## Erros conhecidos e contexto histórico

- **Locale do Postgres**: o cluster usa ICU (`--locale-provider=icu --icu-locale=pt-BR-x-icu`), não glibc — `pt_BR.UTF-8` não existe na imagem `postgres:16` (Debian). Ver `infra/postgres/docker-compose.yml` para o porquê comentado.
- **GRANT CONNECT vs GRANT CREATE**: no Postgres, `GRANT CREATE ON DATABASE` não inclui `CONNECT` implicitamente — causou `permission denied for database` no GoTrue. Ver `infra/postgres/setup-roles.sql`.
- **MSYS path conversion**: scripts bash rodados via Git Bash no Windows sofrem reescrita automática de caminhos tipo `/tmp/...` para caminho Windows. Usar `MSYS_NO_PATHCONV=1` nos comandos Docker afetados (ver `infra/postgres/backup/test-restore.sh`).

## Outros serviços do ecossistema

- `nova-tag`: antenas RFID de portão, conexão TCP direta com o hardware.
- `nova-cie` (cie2500-api): central de incêndio Intelbras CIE2500, REST + WebSocket em `/v1/api`.
- `FRONT`: painel administrativo React/Vite, consome esta API via `VITE_API_BASE_URL`.

Essas integrações acontecem via HTTP simples (axios) — não há acoplamento de código entre os repositórios.
