# Changelog - nova-api

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [Unreleased]

### Adicionado
- Esqueleto da v3 (`src/v3/`): servidor Fastify + Zod rodando lado a lado com a v2 (Express) no mesmo processo, porta própria (`PORT_V3`, padrão `3031`). Primeiro endpoint (`GET /v3/api/healthcheck`) valida o padrão de resposta tipado com Zod. Falha ao iniciar a v3 não derruba a v2. Ainda não expõe nenhuma rota de negócio nem exige autenticação.

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
