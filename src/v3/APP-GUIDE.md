# nova-api v3 — Guide for the Android app

Audience: the agent/developer building the Android app (Kotlin). This file explains what the backend offers today and how to use it. The OpenAPI spec next to this file (`openapi.json`, served live at `GET <V3_BASE_URL>/v3/apispec_1.json` and `/v3/swagger` while `SWAGGER_V3_ENABLED=true`) is the source of truth for exact field shapes — when they disagree, the spec wins.

Last updated: 2026-09-30.

---

## 1. The big picture

```text
Android app ──HTTPS──► nova-api v3  (/v3/api/*  and  /v3/ws)
                          ├── Supabase Auth      (login, tokens)      — internal
                          ├── Postgres           (links, settings)    — internal
                          ├── Firebird (ERP)     (people, units, vehicles, accesses) — internal
                          ├── nova-tag ×2        (gates / RFID)       — internal
                          ├── nova-cie           (fire panel)         — internal
                          └── Tasmota modules    (BBQ exhaust fans)   — internal
```

- The app talks **only** to nova-api v3. Never to v2 (`/v2/api`, legacy web panel), never to TAG/CIE/Supabase directly.
- REST base: `<V3_BASE_URL>/v3/api`. WebSocket: `wss://<V3_BASE_URL host>/v3/ws`.
- `<V3_BASE_URL>` comes from build config per build type; never hardcode it in feature code.
- Many routes act on **physical equipment** (gates, doors, exhaust fans, fire panel). Treat every command as non-idempotent: disable the button while in flight, never retry automatically.
- User-facing text is Brazilian Portuguese. `error.detail` from the server is already in Portuguese and safe to show.

---

## 2. Response envelope

Every HTTP response (success or error) is JSON:

```json
{ "success": true, "data": { }, "meta": { "timestamp": "…", "requestId": "…", "version": "v3" } }
```

```json
{
  "success": false,
  "error": {
    "type": "urn:nova-api:validation-error",
    "title": "Dados de entrada inválidos",
    "status": 400,
    "detail": "Um ou mais campos da requisição são inválidos.",
    "instance": "/v3/api/…",
    "validationErrors": [{ "path": "/email", "message": "…" }]
  },
  "meta": { "timestamp": "…", "requestId": "…", "version": "v3" }
}
```

Branch on `error.type` (closed set), never on `detail` text:

| `type` | Status | App reaction |
|---|---|---|
| `urn:nova-api:validation-error` | 400 | Show `validationErrors` on the fields |
| `urn:nova-api:unauthorized` | 401 | Login: wrong credentials. Elsewhere: refresh once, retry once, else log out |
| `urn:nova-api:forbidden` | 403 | If `title == "Troca de senha obrigatória"` → change-password screen; else "Acesso negado" |
| `urn:nova-api:not-found` | 404 | Missing, or not visible to this user |
| `urn:nova-api:conflict` | 409 | Equipment refused / state conflict — show `detail`, do not retry |
| `urn:nova-api:rate-limited` | 429 | Read `Retry-After` (seconds), disable the action until then |
| `urn:nova-api:upstream-error` | 502/503/504 | Device/service unavailable — offer manual retry |
| `urn:nova-api:internal-error` | 500 | Generic error |

Two stable `title`s carry meaning (documented, safe to compare): `"Troca de senha obrigatória"` (403) and `"Confirmação necessária"` (409, vehicle TAG swap). Include `meta.requestId` in bug reports.

A suggested Kotlin mapping: one `sealed class ApiError` in `core/network`, built from `type` + `status` + `detail` + `validationErrors` + `Retry-After`; features only see typed results.

---

## 3. Authentication

All routes except `/health` and `/auth/*` public ones require `Authorization: Bearer <accessToken>`.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/signup` | `{ email, password }` (≥ 8) | 201 `SessionData` |
| POST | `/auth/login` | `{ email, password }` | `SessionData` |
| POST | `/auth/google` | `{ idToken, nonce? }` | `SessionData` |
| POST | `/auth/refresh` | `{ refreshToken }` | `SessionData` |
| POST | `/auth/logout` | — (Bearer) | `null` |
| GET | `/auth/me` | — | `AuthUser` |
| POST | `/auth/password/change` | `{ currentPassword, newPassword }` | `SessionData` |
| POST | `/auth/password/recover` | `{ email }` | 202 `null` (always) |
| POST | `/auth/password/recover/confirm` | `{ email, code, newPassword }` (6-digit code, 15 min) | `SessionData` |

```json
{
  "accessToken": "eyJ…", "refreshToken": "kxco2lm2n5hd", "tokenType": "bearer",
  "expiresIn": 900, "expiresAt": 1790636017,
  "user": { "id": "uuid", "email": "morador@gmail.com", "role": null, "mustChangePassword": false }
}
```

Rules:
- Access token lives 15 min (`expiresAt` = epoch **seconds**). Refresh token is **single-use**: serialize refreshes behind a mutex and replace both tokens atomically.
- Refresh proactively before `expiresAt`, or on 401 (once). If refresh fails → clear session → login.
- Logout: always clear local tokens, even if the call fails.
- `mustChangePassword: true` → only `/auth/password/change`, `/auth/me`, `/auth/logout` work; go straight to change-password (temporary password = `currentPassword`) and store the new `SessionData`.
- Google: Credential Manager with `serverClientId` = web client `628782431663-jcdpiqiph63a50kk21iin4b0dfk32gga.apps.googleusercontent.com`. Send `nonce` only if you set one (raw nonce to the API, SHA-256 to Google). Developer/config error = missing Android OAuth client for the signing SHA-1.
- Rate limits (429 + `Retry-After`): login 20/IP and 5 wrong passwords/e-mail per 15 min; signup 5/IP/h; recovery 3 e-mails/h; code 5 wrong/15 min.
- Store tokens only through `core/session`, encrypted with an Android Keystore key. Never log them.

---

## 4. Who is the user — roles and residence

`user.role` is `null` or a staff role: `porteiro`, `sindico`, `admin`. **Residents** are accounts with `role: null` linked to a unit. Staff may also be residents.

Right after login and on app resume, call `GET /residence/me`:

```json
{
  "status": "ativo", "blocked": false,
  "person": { "sequencia": 91, "nome": "FULANO DE TAL" },
  "units": [{ "sequencia": 97, "quadra": "A", "lote": "124", "label": "A-124",
              "morador": true, "proprietario": true, "locatario": false,
              "blocked": false, "blockedReason": null }]
}
```

| `status` | UI |
|---|---|
| `pendente` | "Cadastro em análise pela administração" — nothing enabled |
| `ativo` | Show units; actions only for units with `blocked: false` |
| `sem-unidade` | "Seu cadastro não possui unidade ativa" — nothing enabled |

`blockedReason`: `nao-morador` → "Você não consta como morador desta unidade." · `unidade-com-inquilino` → "Esta unidade possui inquilino cadastrado; o acesso é do inquilino." · `cadastro-inconsistente` → "Seu cadastro precisa ser regularizado na administração." Server caches up to 2 min.

### What each profile can use

| Feature | Resident (active) | porteiro | sindico | admin |
|---|:-:|:-:|:-:|:-:|
| Exhaust fans (own prumada / all 24) | ✓ own | ✓ all | ✓ all | ✓ all |
| Exhaust module config | — | — | — | ✓ |
| Fire panel — read | ✓ | ✓ | ✓ | ✓ |
| Fire panel — commands | — | ✓ | ✓ | ✓ |
| Gates (open/close/state/cache read) | — | ✓ | ✓ | ✓ |
| Gate restart, cache clear, `keepOpen` | — | — | ✓ | ✓ |
| Doors, access history/verify/register | — | ✓ | ✓ | ✓ |
| CPF/plate/TAG queries, vehicles | — | ✓ | ✓ | ✓ |
| Command history | — | ✓ | ✓ | ✓ |
| Accounts and links, list users | — | — | ✓ | ✓ |
| Staff password reset | — | residents | residents + porteiros | anyone |
| Push broadcast | — | — | ✓ | ✓ |
| Own settings, push subscription, WebSocket | ✓ | ✓ | ✓ | ✓ |

Hide what the user cannot use, but always handle 403/404 — the server decides.

---

## 5. Features and routes

Paths are relative to `/v3/api`. "Command" = physical action: disable button while in flight, no auto-retry, **10 commands/min per account** (429 + `Retry-After`).

### 5.1 Exhaust fans (everyone)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/exhausts` | — | `Exhaust[]` — already filtered to what this user may operate |
| POST | `/exhausts/{id}/on` | `{ minutes? }` (1–1440; omit = stays on) | `Exhaust` |
| POST | `/exhausts/{id}/off` | — | `Exhaust` |
| POST | `/exhausts/modules/{modulo}/config` | `{ comando }` | admin only; raw Tasmota backlog. `modulo` ∈ `A_14,A_58,B_14,B_58,C_14,C_58,PWR_14,PWR_58` |

```json
{ "id": "A4", "tower": "A", "final": 4, "on": true, "expiresAt": 1790636017000, "processStatus": "executado", "moduleOnline": true }
```

- `id` = tower + last digit of the apartment (A-124 → `A4`). Do not compute access in the app — use the list.
- `expiresAt` in epoch **milliseconds** (auto-off) or `null`. `processStatus`: `iniciando` | `executado` | `erro` | `null`.
- `moduleOnline: false` → disable controls, "equipamento offline". 404 on a command → refresh the list. 503 → module offline.

### 5.2 Fire panel — CIE

Read (staff and active residents): `GET /cie/status`, `/cie/panel`, `/cie/alarms/active`, `/cie/counters/blocks`, `/cie/counters/outputs`, `/cie/logs?type=&limit=&cursor=` (cursor pagination: use the cursor returned inside `data` of the previous page).

Commands (staff only — hide for residents):

| Method | Path | Body |
|---|---|---|
| POST | `/cie/commands/{action}` | `{ confirm? }` — actions: `silence`, `release`, `release-bip`, `release-siren`, `restart`, `brigade-siren`, `alarm-general`, `delay-siren`, `silence-bip`, `silence-siren` |
| POST | `/cie/commands/block` | `{ tipoBloqueio, laco, numero, bloquear: 0\|1 }` |
| POST | `/cie/commands/output` | `{ laco, numero, ativo: 0\|1 }` |

- `alarm-general` and `restart` need `{ "confirm": true }` — show a second confirmation dialog first.
- Several commands are toggles: **never retry automatically**. 409 = panel refused (show `detail`). 502/503/504 = panel unreachable.
- Response has `snapshot` (panel state after the command) — use it to refresh the screen.

### 5.3 Gates — TAG (staff)

Each gate is identified by `numeroDispositivo` (from `GET /tag/gates`).

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/tag/gates` | — | `[{ numeroDispositivo, nome, sentido, ativo }]` |
| GET | `/tag/status` | — | `{ updatedAt, gates: [{ numeroDispositivo, nome, sentido, online }] }` |
| GET | `/tag/gate/state` | `?numeroDispositivo=` | `{ state: closed\|opening\|open\|closing\|unknown, keepOpen? }` |
| POST | `/tag/gate/open` | `{ numeroDispositivo, autoCloseTime?, keepOpen? }` | `{ action, autoCloseSeconds, gate }` |
| POST | `/tag/gate/close` | `{ numeroDispositivo }` | same |
| POST | `/tag/gate/restart` | `{ numeroDispositivo, confirm: true }` | síndico/admin; confirm dialog |
| GET | `/tag/cache` | `?numeroDispositivo=&type=` | cache list — resident data, never cache on device |
| DELETE | `/tag/cache` · `/tag/cache/{tag}` | `?numeroDispositivo=&type=` | síndico/admin |

- Open without options closes by itself after 15 s; `autoCloseTime` 1–120 s; `keepOpen: true` is síndico/admin only — separate explicit action.
- Extra short per-gate cooldown (429). 404 = gate inactive; 409 = gate moving / antenna offline.

### 5.4 Doors (staff)

| Method | Path | Returns |
|---|---|---|
| GET | `/doors` | `[{ id, nome, porta, ativo }]` |
| GET | `/doors/status` | `{ updatedAt, doors: [{ id, nome, porta, online }] }` (refreshed every minute) |
| POST | `/doors/{id}/open` | `{ id, nome, porta }` — command. 409 = door without IP/credential configured; 502 = door refused; 503 = unreachable |

### 5.5 Access control (staff)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/access/recent` | `?numeroDispositivo=&limit=` (≤ 50, default 10) | Latest passages: `[{ NOME, TORRE, APARTAMENTO, DATAHORA, DISPOSITIVO, SENTIDO, DESCRICAO, IDACESSO, VEICULO }]` |
| GET | `/access/verify` | `?id=&numeroDispositivo=&sentido=E\|S` | ERP rows; `PERMITIDO = "S"` means allowed. `id` accepts plate, CPF, 10-digit TAG, numeric ID (≤ 8 digits) or formatted ID |
| POST | `/access/register` | ERP fields taken from the verify row (see spec) | 201 — records a manual passage |

Field names in these payloads are raw ERP columns (UPPERCASE) — map them in the repository, not in the UI.

### 5.6 Queries (staff)

`GET /queries/cpf/{cpf}` → `{ cpf, isValid, exists, person (with base64 foto), links[{ pessoaVinculo, unidade }] }`
`GET /queries/plate/{plate}` / `GET /queries/tag/{tag}` → `{ plate|tag, exists, vehicle, unit, owner, accesses[] }`

Personal data (CPF, phone, photo): keep in memory only, never persist or log.

### 5.7 Vehicles (staff)

| Method | Path | Body / query | Notes |
|---|---|---|---|
| GET | `/vehicles` | `?ownerSeq=` | Vehicles of a person (`ownerSeq` = `person.sequencia` from the CPF query) |
| GET | `/vehicles/plate/{plate}` | — | `{ exists, vehicle, accessTag }` |
| POST | `/vehicles/plate/lookup` | `{ plate, provider? }` (`API1\|API2\|API3`) | Brand/model/color from external sources. **Slow** (seconds); 5/min per account; 409 = plate already linked to someone (`detail` says who) |
| PUT | `/vehicles/plate/{plate}` | `{ brand?, model?, color?, ownerSeq, unitSeq? }` | Create or update → `{ created, vehicle }` |
| PUT | `/vehicles/{vehicleSeq}/tag` | `{ cpf, tag, numeroDispositivo, forceSwap? }` | Link TAG. 403 = CPF not allowed; 409 `title = "Confirmação necessária"` → ask "trocar a TAG atual?" and resend with `forceSwap: true`; other 409 = TAG used by another vehicle |
| DELETE | `/vehicles/{vehicleSeq}/tag` | — | Remove TAG |
| DELETE | `/vehicles/{vehicleSeq}/owner` | — | Unlink owner (also removes TAG) |

Typical flow (same as the web panel): CPF query → list owner vehicles → plate details → lookup (if new) → upsert → link TAG.

### 5.8 Command history (staff)

`GET /commands/logs?limit=` (≤ 200, default 20) → `[{ id, timestamp, method, path, command, status, actor, requestId, ip }]` newest first. Includes commands from the web panel (v2) and from the app (v3). Also pushed live via the `command.logged` WebSocket event.

### 5.9 Staff operations (síndico/admin)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/auth/users?page=1&perPage=50` | — | Accounts |
| POST | `/auth/users` | `{ email, password, role }` | 201 (only admin creates admin) |
| POST | `/auth/password/staff-reset` | `{ accountId }` or `{ personSequencia }` | `{ accountId, email, temporaryPassword }` — show once, never store/log |
| GET | `/residence/links` | — | Account ↔ person links |
| PUT | `/residence/links/{accountId}` | `{ personSequencia }` | 404 person not found, 409 person already linked |
| DELETE | `/residence/links/{accountId}` | — | |

### 5.10 Own settings (everyone)

`GET /me/settings` → `{ updatedAt, items: { key: string }, exists }` · `PUT /me/settings` `{ items, updatedAt? }`. Up to 50 string values; `updatedAt` is client epoch ms — on sync, the larger one wins. Good for UI preferences that should follow the user across devices (theme, shortcuts).

### 5.11 Notifications

Today only **Web Push (VAPID)** exists: `GET /push/public-key`, `POST /push/subscriptions` `{ subscription: { endpoint, keys: { p256dh, auth } }, meta? }`, `DELETE /push/subscriptions` `{ endpoint }`, `POST /push/send` (síndico/admin broadcast).

**Native push (FCM) is not available yet** — do not build the Android push flow against these routes. Until FCM exists, the app gets live events only while it has the WebSocket open (next section). Fire alarms reach the building staff through the web panel push.

---

## 6. Real-time — WebSocket `/v3/ws`

Replaces polling for fire panel, gates, exhaust fans and devices.

### Connecting

1. `POST /v3/api/ws/ticket` (Bearer) → `{ "ticket": "…", "expiresIn": 30 }` — single use, valid 30 s.
2. Open `wss://<host>/v3/ws?ticket=<ticket>` (note: path is `/v3/ws`, not under `/v3/api`).
3. First message: `connection.established`. The server only sends; it ignores client messages.

Upgrade refusals (HTTP status on the handshake): 401 invalid/used/expired ticket · 403 account has nothing to receive (pending, no active unit, no staff role) · 429 more than 3 sockets for this account · 503 server full.

### Lifecycle

- The socket is closed by the server with **code 4001** when the access token used to request the ticket expires (≤ 15 min). On 4001: refresh the session → new ticket → reconnect immediately.
- Any other close/failure: reconnect with backoff (1 s, 2 s, 4 s … max 30 s), always with a new ticket.
- After every (re)connect, reload the current state via REST, then apply events on top. Events are deltas, not snapshots.
- Server pings every 30 s (OkHttp answers pongs automatically). Keep the socket only while the relevant screen/app is in the foreground; close it in `onStop`.

### Message format

```json
{ "event": "exhaust.changed", "timestamp": "2026-09-30T21:00:00.000Z", "data": { }, "meta": { "version": "v3" } }
```

### Events

| Event | Who receives | `data` |
|---|---|---|
| `connection.established` | all | `{ ok: true }` |
| `cie.status.updated`, `cie.alarm.triggered`, `cie.failure.triggered`, `cie.log.received` | staff + active residents | CIE state/log payloads (same shapes as the `/cie/*` REST reads) |
| `cie.connection.changed` | staff + active residents | panel ↔ CIE service connection state |
| `exhaust.changed` | staff (all); residents only their prumada | `Exhaust` (same as REST) |
| `gate.state.changed` | staff | `{ numeroDispositivo, state, keepOpen }` |
| `antenna.connection.changed` | staff | `{ numeroDispositivo, connected }` |
| `tag.read` | staff | `{ numeroDispositivo, tag, authorized, reason, direction }` (no personal data) |
| `devices.status.changed` | staff | `{ updatedAt, gates: [{ numeroDispositivo, nome, online }], doors: [{ id, nome, online }] }` — only what changed |
| `command.logged` | staff | command history entry (see 5.8, without `ip`) |
| `upstream.connection.changed` | `service: "cie"` → staff + residents; `"tag"` → staff | `{ service, numeroDispositivo?, connected }` — when `false`, show that data may be stale |

Unknown events must be ignored (new ones may be added).

### Kotlin sketch (OkHttp)

```kotlin
suspend fun openRealtime(): WebSocket {
    val ticket = api.wsTicket().ticket            // POST /v3/api/ws/ticket
    val request = Request.Builder()
        .url("${BuildConfig.V3_WS_URL}/v3/ws?ticket=$ticket")   // wss://host
        .build()
    return okHttp.newWebSocket(request, object : WebSocketListener() {
        override fun onMessage(webSocket: WebSocket, text: String) = events.tryEmit(parse(text))
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            if (code == 4001) scheduleReconnect(refreshFirst = true) else scheduleReconnect()
        }
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) =
            scheduleReconnect(httpStatus = response?.code)
    })
}
```

Put this in one place (e.g. `core/realtime`) exposing a `Flow` of typed events; features subscribe and filter by event name.

---

## 7. Practical rules

- **Never point automated tests at the production API.** Use OkHttp `MockWebServer` with responses shaped like the envelope. Commands move real gates, doors, fans and a fire panel.
- Staff-only data (queries, vehicles, access, gate cache) contains personal data: no disk cache, no logs, no crash-report attachments.
- Numbers: `expiresAt` of the session = epoch seconds; exhaust `expiresAt` = epoch milliseconds.
- Use `numeroDispositivo` for gates everywhere (REST and WebSocket).
- `GET /health` is public and cheap — use it for connectivity checks, not authenticated routes.
- Not available yet (do not build against it): native push (FCM/APNs), resident self-service for vehicles/gates, dashboard aggregate endpoint, account deletion (`DELETE /auth/me`).
