# nova-api

## Vehicle Lookup Providers (v2)

Rota usada pelo FRONT:

- `POST /v2/api/vehicles/plate/lookup`
- body: `{ "plate": "ABC1234" }`

Contrato de resposta mantido:

- `plate`
- `sources[]` (`API1`, `API2`, `API3`)
- `consolidated`
- `overallSuccess`

## Fallback de consulta por fonte

Ordem fixa de prioridade:

1. `API1`: HTTP configuravel -> scraping KePlaca
2. `API2`: HTTP configuravel -> scraping PlacaFipe
3. `API3`: HTTP configuravel -> WDAPI (pago)

Observacoes:

- Execucao sequencial por prioridade.
- Sem retry adicional.
- Falha de uma fonte nao derruba o endpoint.
- Se nenhuma fonte retornar dados validos, resposta `200` com `overallSuccess=false`.

## Variaveis de ambiente

### Gerais

- `VEHICLE_LOOKUP_TIMEOUT_MS` (default: `5000`)
- `VEHICLE_LOOKUP_PROVIDER_1_URL`
- `VEHICLE_LOOKUP_PROVIDER_2_URL`
- `VEHICLE_LOOKUP_PROVIDER_3_URL`
- `CIE_GATEWAY_BASE_URL` (default: `http://192.168.0.250:4021/v1/api`)
- `CIE_GATEWAY_TIMEOUT_MS` (default: `5000`)
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT` (ex.: `mailto:suporte@dominio.com`)
- `PUSH_SUBSCRIPTIONS_DIR` (default: `./storage/push-subscriptions`)

### Scraping

- `VEHICLE_LOOKUP_SCRAPING_ENABLED` (default: `true`)
- `VEHICLE_LOOKUP_SCRAPING_API1_ENABLED` (default: `true`)
- `VEHICLE_LOOKUP_SCRAPING_API2_ENABLED` (default: `true`)
- `PUPPETEER_EXECUTABLE_PATH` (ex.: `/usr/bin/chromium-browser`)
- `PUPPETEER_HEADLESS` (default: `true`)

### WDAPI (fonte paga)

- `VEHICLE_LOOKUP_WDAPI_ENABLED` (default: `false`)
- `VEHICLE_LOOKUP_WDAPI_URL_TEMPLATE` (ex.: `https://wdapi2.com.br/consulta/{plate}/{token}`)
- `VEHICLE_LOOKUP_WDAPI_TOKEN`

Templates:

- `{plate}` e `{token}` sao suportados.
- Se URL nao tiver `{plate}`, a API adiciona `?plate=ABC1234` automaticamente.

## Exemplo rapido de configuracao

```env
VEHICLE_LOOKUP_TIMEOUT_MS=5000
VEHICLE_LOOKUP_PROVIDER_1_URL=
VEHICLE_LOOKUP_PROVIDER_2_URL=
VEHICLE_LOOKUP_PROVIDER_3_URL=https://wdapi2.com.br/consulta/{plate}/{token}

VEHICLE_LOOKUP_SCRAPING_ENABLED=true
VEHICLE_LOOKUP_SCRAPING_API1_ENABLED=true
VEHICLE_LOOKUP_SCRAPING_API2_ENABLED=true

VEHICLE_LOOKUP_WDAPI_ENABLED=false
VEHICLE_LOOKUP_WDAPI_URL_TEMPLATE=https://wdapi2.com.br/consulta/{plate}/{token}
VEHICLE_LOOKUP_WDAPI_TOKEN=seu_token_wdapi

PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
PUPPETEER_HEADLESS=true
```

## Web Push (Sprint 1)

Rotas:

- `GET /v2/api/push/public-key`
- `POST /v2/api/push/subscriptions`
- `DELETE /v2/api/push/subscriptions`
- `POST /v2/api/push/send`
- `POST /v2/api/push/events/fire-alarm`

Observacoes:

- O endpoint `send` permite envio generico de push para todos os inscritos.
- O endpoint `fire-alarm` e um atalho semantico para notificacao de incendio.
- Subscriptions invalidas (HTTP 404/410 no provedor push) sao removidas automaticamente.
