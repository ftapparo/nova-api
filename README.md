# nova-api

API principal do **Condomínio Nova Residence**: controle de acesso (portões, portas, veículos), integração com o ERP Freedom PROANSI (Firebird), exaustores de churrasqueira, gateway para a central de incêndio (nova-cie), notificações push e configurações de usuário.

## Arquitetura

O código é organizado em duas camadas:

```
src/
  core/         # lógica de negócio e integrações, sem framework HTTP
    services/   # Firebird, exaustores, controle de acesso, push, busca de veículo
    repositories/  # acesso a dados: Firebird (queries) e Postgres (user-settings, push-subscriptions)
    utils/      # logger, pool de conexão Postgres

  v2/           # API REST atual (Express), consumida pelo painel web da portaria
    api/        # bootstrap do Express
    controllers/
    routes/
    middleware/ # segurança (CORS, rate limit, headers), auditoria, contexto de requisição

  scripts/      # scripts avulsos (ex.: migração de dados)
  server.ts     # entry point: inicializa core (Firebird, exaustores, controle de acesso) e a v2
```

`core/` não depende de nenhum framework HTTP — é a mesma lógica reaproveitada por qualquer camada de API que vier a existir (hoje só a v2, em Express; uma v3 futura, pensada para consumo mobile, viveria lado a lado sem duplicar essa lógica).

## Stack

- **Node.js 20 + TypeScript**
- **Express** — camada HTTP da v2
- **Firebird** (`node-firebird`) — banco do ERP Freedom PROANSI (fonte da verdade de moradores, veículos, acessos)
- **PostgreSQL** (`pg`) — configurações de usuário e inscrições de notificação push
- **web-push** — notificações push (Web Push API)
- **Puppeteer** — scraping de fallback para consulta de placas
- **Winston** — logs estruturados com rotação diária
- **Swagger** (`swagger-ui-express`) — documentação interativa, desabilitada por padrão em produção

## Configuração

Copie `.env.example` para `.env` e ajuste. Principais grupos de variáveis:

- **Firebird**: `FIREBIRD_HOST`, `FIREBIRD_PORT`, `FIREBIRD_DATABASE`, `FIREBIRD_USER`, `FIREBIRD_PASSWORD`, `FIREBIRD_POOL_SIZE`
- **Postgres**: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `NOVA_API_APP_USER`, `NOVA_API_APP_PASSWORD`, `POSTGRES_POOL_SIZE`
- **Segurança**: `CORS_ALLOWED_ORIGINS`, `SWAGGER_ENABLED`, `BODY_LIMIT`, `RATE_LIMIT_GENERAL_MAX`, `RATE_LIMIT_POLLING_MAX`, `RATE_LIMIT_COMMAND_MAX`
- **Consulta de veículos**: `VEHICLE_LOOKUP_*` (ver seção abaixo)
- **Web Push**: `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`
- **Exaustores**: `EXHAUST_*_HOST`, `EXHAUST_MEMORY_DIR`, `EXHAUST_SWEEP_INTERVAL_MS`
- **Central de incêndio**: `CIE_GATEWAY_BASE_URL`, `CIE_GATEWAY_TIMEOUT_MS`

## Execução

```bash
npm install
npm run build
npm start
```

Desenvolvimento (hot reload, usa `.env.dev`):

```bash
npm run dev
```

## Docker

```bash
docker build -t nova-api .
docker compose up -d
```

O `docker-compose.yml` não define segredos (`env_file` removido de propósito — ver comentário no arquivo): a stack roda via Portainer apontando para este repositório (Git-based), e as variáveis de ambiente reais são configuradas diretamente no Portainer.

## API REST (v2)

Base: `/v2/api`

Principais grupos de rotas:

- `/v2/api/access` — controle de acesso (verificação de identidade, registro, histórico)
- `/v2/api/vehicle`, `/v2/api/vehicles` — consulta e controle de veículos
- `/v2/api/exhausts` — exaustores de churrasqueira
- `/v2/api/query` — consultas diversas (CPF, placa, TAG)
- `/v2/api/control` — portas e portões
- `/v2/api/user-settings/:user` — preferências do usuário (Postgres)
- `/v2/api/push/*` — inscrições e envio de notificações push
- `/v2/api/cie/*` — gateway para a nova-cie (central de incêndio)
- `/v2/api/command-logs` — auditoria de comandos físicos

Documentação Swagger (quando `SWAGGER_ENABLED=true`): `/v2/swagger`.

### Vehicle Lookup

Rota usada pelo FRONT:

- `POST /v2/api/vehicles/plate/lookup`
- body: `{ "plate": "ABC1234" }`

Contrato de resposta: `plate`, `sources[]` (`API1`, `API2`, `API3`), `consolidated`, `overallSuccess`.

Fallback em cascata, execução sequencial, sem retry adicional, falha de uma fonte não derruba o endpoint:

1. `API1`: HTTP configurável → scraping KePlaca
2. `API2`: HTTP configurável → scraping PlacaFipe
3. `API3`: HTTP configurável → WDAPI (pago)

Variáveis: `VEHICLE_LOOKUP_TIMEOUT_MS`, `VEHICLE_LOOKUP_PROVIDER_{1,2,3}_URL`, `VEHICLE_LOOKUP_SCRAPING_ENABLED`, `VEHICLE_LOOKUP_SCRAPING_API{1,2}_ENABLED`, `PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_HEADLESS`, `VEHICLE_LOOKUP_WDAPI_ENABLED`, `VEHICLE_LOOKUP_WDAPI_URL_TEMPLATE`, `VEHICLE_LOOKUP_WDAPI_TOKEN`.

Templates de URL suportam `{plate}` e `{token}`; se a URL não tiver `{plate}`, a API adiciona `?plate=ABC1234` automaticamente.

### Web Push

- `GET /v2/api/push/public-key`
- `POST /v2/api/push/subscriptions`
- `DELETE /v2/api/push/subscriptions`
- `POST /v2/api/push/send`
- `POST /v2/api/push/events/fire-alarm`

O endpoint `send` permite envio genérico para todos os inscritos; `fire-alarm` é um atalho semântico para notificação de incêndio (usado pelo relay da nova-cie). Inscrições inválidas (HTTP 404/410 no provedor push) são removidas automaticamente. Inscrições e configurações de usuário são persistidas no Postgres (ver `src/scripts/migrate-json-to-postgres.ts` para o histórico da migração a partir de arquivos `.json`).

## Persistência

- **Firebird**: dados operacionais do condomínio (moradores, veículos, histórico de acesso) — fonte de verdade do ERP Freedom PROANSI, somente leitura/escrita pontual conforme regras de negócio.
- **PostgreSQL** (`nova-postgres`): `user_settings` e `push_subscriptions`, com a role `nova_api_app` (dona só do schema `public`, isolada do schema `auth` usado pelo Supabase Auth).

## Changelog

Consulte o [CHANGELOG.md](CHANGELOG.md).

## Licença

MIT — veja [LICENSE](LICENSE) se presente, ou consulte o autor.

## Autor

**Flavio Eduardo Tapparo** — [github.com/ftapparo](https://github.com/ftapparo)
