# nova-api

## Vehicle Lookup Providers (v2)

Configuracoes opcionais para a rota `POST /v2/api/vehicles/plate/lookup`:

- `VEHICLE_LOOKUP_PROVIDER_1_URL`
- `VEHICLE_LOOKUP_PROVIDER_2_URL`
- `VEHICLE_LOOKUP_PROVIDER_3_URL`
- `VEHICLE_LOOKUP_TIMEOUT_MS` (default: `5000`)

Cada URL pode usar o placeholder `{plate}`. Exemplo:

`https://api.exemplo.com/veiculo/{plate}`

Quando o placeholder nao existir, a API envia `?plate=ABC1234` automaticamente.
