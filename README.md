<div align="center">

# 🏢 Nova API - Serviços do Condomínio Nova Residence

**API principal de integração: controle de acesso, portões, veículos, exaustores, central de incêndio e notificações**

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/ftapparo/nova-api)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-20.x-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

---

## 📋 Índice

- [Sobre o Projeto](#-sobre-o-projeto)
- [Funcionalidades](#-funcionalidades)
- [Arquitetura](#-arquitetura)
- [Tecnologias](#-tecnologias)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Execução](#-execução)
- [API REST](#-api-rest)
- [Documentação Swagger](#-documentação-swagger)
- [Persistência](#-persistência)
- [Docker](#-docker)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Segurança](#-segurança)
- [Changelog](#-changelog)
- [Licença](#-licença)
- [Autor](#-autor)

---

## 🎯 Sobre o Projeto

**Nova API** é a API principal do **Condomínio Nova Residence**: integra o ERP Freedom PROANSI (Firebird) com o controle de acesso físico (portões, portas, veículos), orquestra os exaustores de churrasqueira, atua como gateway para a central de incêndio (`nova-cie`) e envia notificações push aos moradores. É o backend consumido pelo painel administrativo (FRONT) e, futuramente, por apps mobile nativos.

### ✨ Diferenciais

- **Integração com ERP legado** via Firebird, sem exigir mudanças no sistema do condomínio
- **Gateway para hardware físico**: portões, portas, exaustores e central de incêndio, cada um com seu próprio microserviço
- **Notificações Web Push** com limpeza automática de inscrições inválidas
- **Fallback em cascata** para consulta de placas (scraping + API paga)
- **Segurança de borda**: CORS restrito, rate limiting por bucket, headers de segurança
- **Persistência híbrida**: Firebird (dados operacionais do ERP) + PostgreSQL (configurações e push)

---

## 🚀 Funcionalidades

### Controle de Acesso
- ✅ Verificação de identidade e registro de acesso (portaria)
- ✅ Controle de portões e portas via gateway TCP (`nova-tag`)
- ✅ Consulta de veículos por placa, CPF e TAG
- ✅ Histórico de acessos e auditoria de comandos físicos

### Integrações
- ✅ Gateway para a central de incêndio (`nova-cie`): status, painel, comandos, logs
- ✅ Controle remoto de exaustores de churrasqueira
- ✅ Consulta de placas com fallback em 3 fontes (scraping + WDAPI paga)

### Notificações e Preferências
- ✅ Web Push (VAPID): inscrição, remoção, envio genérico e alarme de incêndio
- ✅ Configurações de usuário (tema, atalhos, nomes customizados) persistidas em Postgres

### Segurança e Confiabilidade
- ✅ CORS restrito por lista branca de origens
- ✅ Rate limiting em múltiplos buckets (geral, polling do dashboard, comandos físicos)
- ✅ Headers de segurança (tipo helmet) e Swagger desabilitado por padrão em produção
- ✅ Logs estruturados com rotação diária

---

## 🏗️ Arquitetura

O código separa a lógica de negócio (agnóstica de framework HTTP) da camada de API:

```
┌─────────────────────────────────────────────┐
│          v2/ — API REST (Express)            │
│  Rotas, Controllers, Middleware, Swagger    │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│          core/ — Core Business Logic         │
│  Firebird, Postgres, Exaustores,            │
│  Controle de Acesso, Push, Vehicle Lookup    │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│          Integrações Externas                │
│  ERP Freedom (Firebird), nova-tag, nova-cie, │
│  Web Push, WDAPI/scraping                    │
└─────────────────────────────────────────────┘
```

`core/` não depende do Express nem de nenhum framework HTTP — é a mesma lógica reaproveitada por qualquer camada de API que vier a existir. Hoje só a v2 (Express) a consome; uma v3 futura (Fastify + Zod, pensada para consumo mobile) rodaria lado a lado, sem duplicar essa lógica.

### Camadas do Sistema

**API Layer** (`src/v2/api/`, `src/v2/routes/`, `src/v2/controllers/`, `src/v2/middleware/`)
- Exposição de endpoints REST
- Segurança de borda: CORS, rate limit, headers
- Auditoria de comandos e contexto de requisição
- Documentação Swagger

**Core Layer** (`src/core/`)
- `services/` — Firebird, exaustores, controle de acesso, push, busca de veículo
- `repositories/` — acesso a dados: Firebird (queries) e Postgres (user-settings, push-subscriptions)
- `utils/` — logger, pool de conexão Postgres

---

## 🛠️ Tecnologias

### Runtime e Linguagem
- **Node.js 20.x** - Ambiente de execução
- **TypeScript 5.8** - Linguagem com tipagem estática

### Framework e API
- **Express** - Framework web da camada v2
- **Swagger UI** - Documentação interativa da API

### Persistência e Integrações
- **node-firebird** - Banco do ERP Freedom PROANSI
- **pg** - Cliente PostgreSQL (configurações de usuário, push)
- **web-push** - Notificações Web Push (VAPID)
- **puppeteer** - Scraping de fallback para consulta de placas
- **axios** - Cliente HTTP para integrações externas (nova-tag, nova-cie)
- **cors** - Controle de CORS

### Logs e Monitoramento
- **winston** + **winston-daily-rotate-file** - Logs estruturados com rotação diária

### Ambiente e Configuração
- **dotenv** - Gerenciamento de variáveis de ambiente

### Desenvolvimento
- **ts-node-dev** - Hot reload para desenvolvimento
- **ESLint** - Linter para qualidade de código

---

## 📦 Instalação

### Pré-requisitos

- Node.js >= 20.x
- npm >= 10.x
- Docker (opcional, recomendado para produção)
- Acesso de rede ao Firebird do ERP e ao PostgreSQL (`nova-postgres`)

### Clonar o Repositório

```bash
git clone https://github.com/ftapparo/nova-api.git
cd nova-api
```

### Instalar Dependências

```bash
npm install
```

### Compilar TypeScript

```bash
npm run build
```

---

## ⚙️ Configuração

Copie `.env.example` para `.env` e ajuste. Principais grupos de variáveis:

- **Servidor**: `PORT` (padrão: `3030`)
- **Firebird**: `FIREBIRD_HOST`, `FIREBIRD_PORT`, `FIREBIRD_DATABASE`, `FIREBIRD_USER`, `FIREBIRD_PASSWORD`, `FIREBIRD_POOL_SIZE`
- **Postgres**: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `NOVA_API_APP_USER`, `NOVA_API_APP_PASSWORD`, `POSTGRES_POOL_SIZE`
- **Segurança**: `CORS_ALLOWED_ORIGINS`, `SWAGGER_ENABLED`, `BODY_LIMIT`, `RATE_LIMIT_GENERAL_MAX`, `RATE_LIMIT_POLLING_MAX`, `RATE_LIMIT_COMMAND_MAX`
- **Consulta de veículos**: `VEHICLE_LOOKUP_*` (ver seção [Vehicle Lookup](#vehicle-lookup))
- **Web Push**: `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`
- **Exaustores**: `EXHAUST_*_HOST`, `EXHAUST_MEMORY_DIR`, `EXHAUST_SWEEP_INTERVAL_MS`
- **Central de incêndio**: `CIE_GATEWAY_BASE_URL` (padrão: `http://192.168.0.250:4021/v1/api`), `CIE_GATEWAY_TIMEOUT_MS`

---

## 🚀 Execução

### Modo Desenvolvimento

```bash
npm run dev
```

### Modo Produção

```bash
npm run build
npm start
```

---

## 🌐 API REST

Base: `/v2/api`

### Endpoints por grupo

| Grupo | Base | Descrição |
|---|---|---|
| Health | `/v2/api/healthcheck` | Healthcheck do serviço |
| Access | `/v2/api/access` | Verificação de identidade, registro e histórico de acesso |
| Vehicle | `/v2/api/vehicle`, `/v2/api/vehicles` | Consulta e controle de veículos |
| Exhausts | `/v2/api/exhausts` | Exaustores de churrasqueira |
| Query | `/v2/api/query` | Consultas diversas (CPF, placa, TAG) |
| Control | `/v2/api/control` | Portas e portões |
| User Settings | `/v2/api/user-settings/:user` | Preferências do usuário (Postgres) |
| Push | `/v2/api/push/*` | Inscrições e envio de notificações push |
| CIE Gateway | `/v2/api/cie/*` | Gateway para a `nova-cie` |
| Command Logs | `/v2/api/command-logs` | Auditoria de comandos físicos |

### Vehicle Lookup

```http
POST /v2/api/vehicles/plate/lookup
Content-Type: application/json

{ "plate": "ABC1234" }
```

Contrato de resposta: `plate`, `sources[]` (`API1`, `API2`, `API3`), `consolidated`, `overallSuccess`.

Fallback em cascata, execução sequencial, sem retry adicional — falha de uma fonte não derruba o endpoint:

1. `API1`: HTTP configurável → scraping KePlaca
2. `API2`: HTTP configurável → scraping PlacaFipe
3. `API3`: HTTP configurável → WDAPI (pago)

Variáveis: `VEHICLE_LOOKUP_TIMEOUT_MS`, `VEHICLE_LOOKUP_PROVIDER_{1,2,3}_URL`, `VEHICLE_LOOKUP_SCRAPING_ENABLED`, `VEHICLE_LOOKUP_SCRAPING_API{1,2}_ENABLED`, `PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_HEADLESS`, `VEHICLE_LOOKUP_WDAPI_ENABLED`, `VEHICLE_LOOKUP_WDAPI_URL_TEMPLATE`, `VEHICLE_LOOKUP_WDAPI_TOKEN`.

Templates de URL suportam `{plate}` e `{token}`; se a URL não tiver `{plate}`, a API adiciona `?plate=ABC1234` automaticamente.

### Web Push

| Método | Rota | Descrição |
|---|---|---|
| GET | `/v2/api/push/public-key` | Chave pública VAPID |
| POST | `/v2/api/push/subscriptions` | Inscreve um dispositivo |
| DELETE | `/v2/api/push/subscriptions` | Remove inscrição |
| POST | `/v2/api/push/send` | Envio genérico para todos os inscritos |
| POST | `/v2/api/push/events/fire-alarm` | Atalho semântico para alarme de incêndio (usado pelo relay da `nova-cie`) |

Inscrições inválidas (HTTP 404/410 no provedor push) são removidas automaticamente.

---

## 📚 Documentação Swagger

Desabilitada por padrão em produção (`SWAGGER_ENABLED=false`): o spec cataloga endpoints que acionam portões e a central de incêndio.

- Interface: `/v2/swagger`
- Spec JSON: `/v2/apispec_1.json`

---

## 💾 Persistência

- **Firebird**: dados operacionais do condomínio (moradores, veículos, histórico de acesso) — fonte de verdade do ERP Freedom PROANSI.
- **PostgreSQL** (`nova-postgres`): tabelas `user_settings` e `push_subscriptions`, acessadas pela role `nova_api_app` (dona só do schema `public`, isolada do schema `auth` usado pelo Supabase Auth). Migradas de arquivos `.json` — ver `src/scripts/migrate-json-to-postgres.ts` para o histórico.

---

## 🐳 Docker

```bash
docker build -t nova-api .
docker compose up -d
```

O `docker-compose.yml` não define segredos: a stack roda via Portainer apontando para este repositório (Git-based), e as variáveis de ambiente reais são configuradas diretamente no Portainer — nunca commitadas.

---

## 📁 Estrutura do Projeto

```
nova-api/
├── src/
│   ├── server.ts                  # Entry point da aplicação
│   ├── core/                      # Lógica de negócio, sem framework HTTP
│   │   ├── services/              # Firebird, exaustores, controle de acesso, push, vehicle-lookup
│   │   ├── repositories/          # Firebird (queries) e Postgres (user-settings, push-subscriptions)
│   │   └── utils/                 # logger, pool de conexão Postgres
│   ├── v2/                        # API REST (Express)
│   │   ├── swagger.json
│   │   ├── api/
│   │   │   └── web-server.api.ts  # Inicialização do servidor Express
│   │   ├── controllers/
│   │   ├── routes/
│   │   └── middleware/            # segurança, auditoria, contexto de requisição
│   └── scripts/                   # scripts avulsos (ex.: migração JSON → Postgres)
├── infra/                         # docker-compose e SQL do Postgres/backup
├── .env.example                   # Exemplo de configuração
├── .gitignore
├── CHANGELOG.md                   # Histórico de versões
├── README.md                      # Este arquivo
├── package.json
├── tsconfig.json
└── Dockerfile
```

---

## 🔐 Segurança

- ✅ CORS restrito por lista branca (`CORS_ALLOWED_ORIGINS`)
- ✅ Rate limiting em múltiplos buckets: geral, polling do dashboard, comandos físicos
- ✅ Headers de segurança tipo helmet
- ✅ Swagger desabilitado por padrão em produção
- ✅ Auditoria de comandos físicos (`command-audit` middleware)
- ✅ Variáveis de ambiente para credenciais, nunca commitadas
- ✅ Isolamento de schema no Postgres: `nova_api_app` só acessa `public`, sem privilégio em `auth`

---

## 📄 Changelog

Para ver o histórico completo de versões e alterações, consulte o [CHANGELOG.md](CHANGELOG.md).

---

## 📝 Licença

Este projeto está licenciado sob a **MIT License** - veja o arquivo [LICENSE](LICENSE) para mais detalhes, se presente.

---

## 👤 Autor

**Flavio Eduardo Tapparo**

- GitHub: [@ftapparo](https://github.com/ftapparo)
- Projeto: [nova-api](https://github.com/ftapparo/nova-api)

---

## 🏢 Contexto

Sistema desenvolvido para o **Condomínio Nova Residence** para integração completa entre o ERP do condomínio e os sistemas físicos de acesso, segurança e conforto.

---

<div align="center">

**Desenvolvido com ❤️ para automação inteligente**

[⬆ Voltar ao topo](#-nova-api---serviços-do-condomínio-nova-residence)

</div>
