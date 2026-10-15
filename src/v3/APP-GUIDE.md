# nova-api v3 — Guide for the Android app

Audience: the agent/developer building the Android app (Kotlin). This file explains what the backend offers today and how to use it. The OpenAPI spec next to this file (`openapi.json`, served live at `GET <V3_BASE_URL>/v3/apispec_1.json` and `/v3/swagger` while `SWAGGER_V3_ENABLED=true`) is the source of truth for exact field shapes — when they disagree, the spec wins.

Last updated: 2026-10-14 (exhaust `location` and condo area check).

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

Stable `title`s that carry meaning (documented, safe to compare): `"Troca de senha obrigatória"` (403), `"Confirmação necessária"` (409, vehicle TAG swap) and the exhaust location refusals (403, §5.1): `"Localização necessária"`, `"Localização simulada"`, `"Localização imprecisa"`, `"Fora da área do condomínio"`. Include `meta.requestId` in bug reports.

**Language.** Send `Accept-Language` with the app language (`pt-BR`, `en` or `es`) on every request. The API answers in it the texts it generates: `error.detail`, the fire panel labels (`event.label`, `display.title`, `display.place.*Label` and `area`, `situation.label`) and the push texts (by the `language` stored at device registration, §5). It does **not** translate `error.title` (stable keys above), messages written by the síndico, panel names (`deviceName`, `zoneName`, rules, `areaDetail` free text) or the legal documents (the official text is Portuguese). Missing header or another language = Portuguese.

A suggested Kotlin mapping: one `sealed class ApiError` in `core/network`, built from `type` + `status` + `detail` + `validationErrors` + `Retry-After`; features only see typed results.

---

## 3. Authentication

All routes except `/health` and `/auth/*` public ones require `Authorization: Bearer <accessToken>`.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/signup` | `{ email, password, acceptedTermsVersion }` (≥ 8) | 201 `SessionData` |
| POST | `/auth/login` | `{ email, password }` | `SessionData` |
| POST | `/auth/google` | `{ idToken, nonce?, acceptedTermsVersion? }` | `SessionData` |
| POST | `/auth/refresh` | `{ refreshToken }` | `SessionData` |
| POST | `/auth/logout` | — (Bearer) | `null` |
| GET | `/auth/me` | — | `AuthUser` + `mustAcceptTerms` |
| DELETE | `/auth/me` | `{ confirm: true }` (Bearer) | `null` — deletes the own account; staff get 403 |
| POST | `/auth/password/change` | `{ currentPassword, newPassword }` | `SessionData` |
| POST | `/auth/password/recover` | `{ email }` | 202 `null` (always) |
| POST | `/auth/password/recover/confirm` | `{ email, code, newPassword }` (6-digit code, 15 min) | `SessionData` |

```json
{
  "accessToken": "eyJ…", "refreshToken": "kxco2lm2n5hd", "tokenType": "bearer",
  "expiresIn": 900, "expiresAt": 1790636017,
  "user": { "id": "uuid", "email": "morador@gmail.com", "role": null, "mustChangePassword": false, "mustAcceptTerms": false }
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
| Web Push broadcast (web panel) | — | — | ✓ | ✓ |
| Own settings, device registration and push preferences, WebSocket | ✓ | ✓ | ✓ | ✓ |

Hide what the user cannot use, but always handle 403/404 — the server decides.

---

## 5. Features and routes

Paths are relative to `/v3/api`. "Command" = physical action: disable button while in flight, no auto-retry, **10 commands/min per account** (429 + `Retry-After`).

### 5.1 Exhaust fans (everyone)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/exhausts` | — | `Exhaust[]` — already filtered to what this user may operate |
| POST | `/exhausts/{id}/on` | `{ minutes?, location? }` (1–1440; omit = stays on; `location` required for residents) | `Exhaust` |
| POST | `/exhausts/{id}/off` | — | `Exhaust` |
| PUT | `/exhausts/{id}/maintenance` | `{ maintenance }` | síndico/admin; marks/unmarks maintenance (no relay action) |
| POST | `/exhausts/modules/{modulo}/config` | `{ comando }` | admin only; raw Tasmota backlog. `modulo` ∈ `A_14,A_58,B_14,B_58,C_14,C_58,PWR_14,PWR_58` |

```json
{ "id": "A4", "tower": "A", "final": 4, "on": true, "expiresAt": 1790636017000, "processStatus": "executado", "moduleOnline": true, "command": "ligar", "maintenance": false }
```

- `id` = tower + last digit of the apartment (A-124 → `A4`). Do not compute access in the app — use the list.
- `expiresAt` in epoch **milliseconds** (auto-off) or `null`. `processStatus`: `iniciando` | `executado` | `erro` | `null`.
- `moduleOnline: false` → disable controls, "equipamento offline". 404 on a command → refresh the list. 503 → module offline.
- `command`: direction of the last command (`ligar` | `desligar` | `null`). With `processStatus: "iniciando"` it tells "ligando" from "desligando" (`on` is already `false` while turning off).
- `maintenance: true` → equipment unavailable for use; `POST /on` answers **409**. Only síndico/admin change it. The v2 web panel does not honor this flag.
- **Restart timer**: sending `POST /on { minutes }` again while it is on recomputes `expiresAt` from now; the relay stays on.
- **Location (residents)**: turning on and restarting require `location: { latitude, longitude, accuracy, mock }` read at the moment of the tap (foreground only). The server compares it with the condo area (a circle in `EXHAUST_GEOFENCE_*`, never in the app) and accepts when the accuracy circle touches the area and `accuracy` ≤ `EXHAUST_GEOFENCE_MAX_ACCURACY_M` (default 100 m). Refusals are **403** with a stable `title`: `"Localização necessária"` (missing), `"Localização simulada"` (`mock: true`), `"Localização imprecisa"`, `"Fora da área do condomínio"` — nothing reaches the relay, so the command is not uncertain; do not treat these 403s as lost access. Staff (`porteiro`, `sindico`, `admin`) are exempt and send nothing. Area not configured on the server → 503 "Verificação de localização indisponível.". Refused attempts count toward the 10/min limit. Coordinates are only compared — never stored or logged. Turning off never needs location.
- **Simulated exhaust (store review account)**: units listed in `EXHAUST_DEMO_UNITS` (e.g. the fictitious `XYZ-100` of the Google Play test account) get an in-memory exhaust (`XYZ0`, `simulated: true`) that behaves like a real one — "Ligando" transition, timer, restart, auto-off, `exhaust.changed` and the push notices — but never reaches a relay. The location check does not apply to it, so reviewers can test from anywhere; real exhaust fans still require the condo area for every resident. The app needs no special handling: it matches the unit by tower + final as usual.
- **Push**: whoever turned it on or restarted the timer last through the app owns the current cycle and is the only one who gets "faltam X minutos" and "desligado" (§5.11). Turning it off yourself through the app sends nothing.

### 5.2 Fire panel — CIE

Read (staff and active residents): `GET /cie/status`, `/cie/panel`, `/cie/alarms/active`, `/cie/events/active?type=`, `/cie/installation`, `/cie/counters/blocks`, `/cie/counters/outputs`, `/cie/logs?type=&kind=&limit=&cursor=` (cursor pagination: use the cursor returned inside `data` of the previous page).

The backend already interprets every panel event — **do not interpret codes in the app**:

- Every log/event item has `event` (`category`, `code`, `label`, `kind`, `severity`) and `display` with **each piece in its own field**: `title` (event label), `device` (device type, e.g. "Sensor de Fumaça"), `deviceName` (name registered in the panel), `place` (`tower`/`towerLabel`, `floor`/`floorLabel` — 0 = Térreo —, `position`/`positionLabel` = A, B or C inside the floor, `area`/`areaDetail` for places outside the floors — Pressurização, Garagem, Elevador, Estacionamentos, Central de incêndio), `rule` (`{ id, name }` in rule operations such as 49 "Regra Acionada"), `loop`, `address`, `zone`, `zoneName`. The backend completes each event with the panel's registered configuration (zones, rules, devices), so `place` is filled for every registered device.
- `/cie/installation` lists the panel's zones, rules and devices, each device with `device` (type label) and `place` — use it for device/zone listings. Lay them out as you like; never parse `deviceName` or join/interpret codes yourself. Color by `event.severity` (`critical` | `warning` | `info` | `ok`). `eventType` is the raw code, kept only for bug reports.
- `event.kind`: `ativacao` (something started: fire, new failure), `restauracao` (back to normal), `estado` (system summary), `informativo` (record only). `/cie/logs?kind=ativacao` lists only real occurrences.
- `source`: `historico` (panel log) or `ativo` (active right now).
- `/cie/panel` and `/cie/alarms/active` carry `situation` (`state`, `label`, `severity`, `silenced`) — use it as the screen headline ("Sistema em alarme", "Sistema normal", "Central sem comunicação").
- Active events now: `/cie/events/active` (`events.alarme|falha|supervisao`; `events.bloqueio` is always empty — the panel does not provide that list, use `counters.bloqueio` and `/cie/counters/blocks`) and `activeAlarms` in `/cie/alarms/active`. `latestAlarmLogs` is history, not "active".

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
| POST | `/access/register` | ERP fields taken from the verify row (see spec); optional `dataHora` (ISO 8601 with offset, up to 10 min in the past) | 201 — records a manual passage, at `dataHora` or now |

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

### 5.11 Notifications — native push (FCM)

The app uses **only** `/notifications/*`. `/push/*` is the web panel's Web Push (VAPID) and is not for the app.

| Method | Path | Body | Returns |
|---|---|---|---|
| PUT | `/notifications/devices/android` | `{ installationId, token, appVersion?, osVersion?, deviceModel?, notificationsEnabled, alarmChannelEnabled?, language? }` | `{ platform, installationId, notificationsEnabled, alarmChannelEnabled, registeredAt }` |
| DELETE | `/notifications/devices/android/{installationId}` | — | `null` (idempotent; only removes this account's device) |
| PUT / DELETE | `/notifications/devices/ios`, `/notifications/devices/ios/{installationId}` | same body | `null` — **reserved**: nothing is stored until the iOS app exists |
| GET | `/notifications/preferences` | — | `{ exhaustExpiring, exhaustExpiringMinutes, exhaustOff, messages, cieStaffAlerts }` |
| PUT | `/notifications/preferences` | `{ exhaustExpiring?, exhaustOff?, messages?, cieStaffAlerts? }` (at least one) | same as GET |
| POST | `/notifications/test` | — | `{ targets, sent, failed }` — a test push to this account's devices; 503 when push is disabled on the server |
| POST | `/notifications/test/fire-alarm` | `{ installationId, type? }` (`alarm` default, or `resolved` for the "back to normal" notice) | `{ targets, sent, failed }` — **admin only**, for validation: the real `cie.alarm` push (same channel, priority and target, title "Alarme de incêndio (teste)") to one device of any account, without touching the panel; 404 when the device is missing or has notifications off. Not used by the app |

**Registering the device**
- `installationId`: a UUID the app generates once per installation and keeps; `token`: the FCM registration token. Register after login (when `mustChangePassword` and `mustAcceptTerms` are resolved — the password rule answers 403 here too), on each app start, in `onNewToken`, and when the notification permission or the fire-alarm channel changes.
- Same device, different account (logout + login): the row moves to the new account. A token reused by FCM leaves any other installation.
- **Logout**: call `DELETE …/android/{installationId}` **before** `/auth/logout` (it needs the access token). `DELETE /auth/me` removes the devices on the server.
- Limits: 30 registrations per hour and 3 tests per 10 min per account (429 + `Retry-After`).
- `notificationsEnabled: false` → the server sends nothing to that device. `alarmChannelEnabled` is stored for diagnosis only.
- `language` (`pt-BR` | `en` | `es`): the push `title`/`body` for this device come in this language (a message keeps the síndico's text; only the category name follows the language). Omitted keeps the stored value (default `pt-BR`). Register again when the user changes the app language.

**Payload (Android).** Data-only message — the app builds the notification, picks the channel and discards the push when there is no session on the device. All values are strings:

```json
{ "type": "cie.alarm", "title": "Alarme de incêndio", "body": "Alarme acionado: Torre B · 8º andar. Siga as orientações de segurança.", "channel": "cie_alarm", "target": "fire", "sentAt": "2026-10-13T22:38:37.423Z", "dispatchId": "41" }
```

Extra fields: `exhaustId` (exhaust types), `messageId` and `category` (`message.published`). `target` = screen the tap opens: `fire` | `exhaust` | `message` | `home`.

| `type` | Who receives | FCM priority | `channel` |
|---|---|---|---|
| `cie.alarm` | staff + residents with an unblocked unit | high | `cie_alarm` (alarm sound) |
| `cie.alarm.resolved` | residents with an unblocked unit who are not staff, once after each alarm, when the panel is back to normal (no alarm, failure, supervision, restart or loss of contact) | normal | `general` (same collapse key as the alarm) |
| `cie.alarm.cleared`, `cie.failure`, `cie.supervision`, `cie.restarting`, `cie.offline` | staff only | normal | `cie_status` |
| `cie.blocked`, `cie.normalized` | staff only | normal | `cie_info` (low importance) |
| `exhaust.expiring` | owner of the current cycle only | high | `exhaust` |
| `exhaust.off`, `exhaust.off.unconfirmed` | owner of the current cycle only | normal | `exhaust` |
| `message.published` | staff + residents with an unblocked unit | normal (`urgente`: high) | `messages` |
| `test` | the account that asked | normal | `general` |

- The app must create these channel ids. `cie_alarm` has an alarm sound (`USAGE_ALARM`); a channel's sound cannot change after creation.
- Fire alarm: one push per alarm episode (a counter dropping for less than 30 s is not a new episode). Residents get **only** `cie.alarm` and, after it, `cie.alarm.resolved` from the panel; failures, supervision and the rest stay with staff. The alarm ignores preferences: the device channel is the user's control.
- `exhaust.expiring` goes out `NOTIFY_EXHAUST_EXPIRING_MINUTES` (server, default 15) before the auto-off. **Owner of the cycle** = the account of the last `POST /exhausts/{id}/on` through the app (turn on or restart timer); earlier accounts stop receiving as soon as someone else restarts. If the timer was changed outside the app (v2 web panel), nobody is notified.
- `message.published`: when a message with `notify: true` (default) becomes visible, including scheduled ones when their time comes.
- `ttl`: alarm 30 min, exhaust until the auto-off (1 h for "off"), messages up to 3 days, staff alerts 6 h. Delivery is not guaranteed in real time (battery savers): never promise an immediate warning in the UI.

---

### 5.12 Condo messages (everyone with an unblocked unit, and staff)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/messages` | `?filter=all\|unread&limit=20&offset=0` (limit ≤ 50) | `{ items: CondoMessage[], unreadCount }` + `meta.pagination` (total of the filter) |
| GET | `/messages/carousel` | — | `{ items: CondoMessage[], unreadCount }` — home carousel of this account (≤ 5, already filtered and ordered) |
| GET | `/messages/{id}` | — | `CondoMessage` |
| POST | `/messages/{id}/read` | — | `CondoMessage` with `read: true` (idempotent; call when the detail opens) |
| POST | `/messages` | `{ category, label?, title, body, publishedAt?, expiresAt?, carouselTtlHours?, pinned?, notify? }` | 201 `CondoMessage` — síndico/admin; `notify` (default true) sends push |
| PATCH | `/messages/{id}` | `{ pinned?, carouselTtlHours? }` | `CondoMessage` — síndico/admin; pin/unpin or change the carousel TTL |
| DELETE | `/messages/{id}` | — | `null` — síndico/admin; archives (record kept) |

```json
{ "id": 12, "category": "manutencao", "label": "Manutenção programada", "title": "Manutenção da bomba de recalque hoje à tarde", "body": "A equipe técnica…", "publishedAt": "2026-10-13T13:30:00.000Z", "expiresAt": null, "carouselTtlHours": 24, "pinned": false, "read": false }
```

- `category`: `manutencao` | `comunicado` | `aviso` | `urgente` — the app picks icon/color. `label` is the free tag shown on the card and the detail; `null` → show the category name.
- Only visible messages are returned: published (`publishedAt` ≤ now), not archived, not expired. Newest first.
- `unreadCount` ignores filter and page: use it for the bell badge.
- Home carousel: `GET /messages/carousel`. The list (`GET /messages`) is not affected by these rules.
  - `carouselTtlHours` (default 24, max 720): hours in the carousel counted from `publishedAt`. `0` = leaves the carousel of each account once that account reads it.
  - `pinned`: stays in the carousel until the síndico unpins it. A pinned message always has TTL 0, so after unpinning it leaves for those who already read it and, for the others, when they read it.
  - Order: category priority first (`urgente` > `aviso` > `manutencao` > `comunicado`), pinned first within the category, then newest. At most 5 items.
- 403 for accounts without an unblocked unit and without a staff role (pending link). 404 = not visible (archived, expired, scheduled).
- Push: a message published with `notify: true` (default in `POST /messages`) sends `message.published` (§5.11) when it becomes visible. Residents can turn it off in `/notifications/preferences`.

### 5.13 Terms of Use and Privacy Policy (public)

Public pages, no token, outside `/v3/api` so store links never change with the API version:

| URL | Returns |
|---|---|
| `https://novaresidence.com.br/termos-de-uso` | HTML (mobile reading copy, link to the PDF) |
| `https://novaresidence.com.br/politica-de-privacidade` | HTML |
| `…/termos-de-uso/pdf` · `…/politica-de-privacidade/pdf` | Official PDF, current version |
| `…/termos-de-uso/{version}/pdf` | Official PDF of an older version |

Under `/v3/api`:

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/legal` | — | — | `[{ document, title, version, effectiveDate, sha256, htmlUrl, pdfUrl }]` |
| GET | `/legal/acceptance` | Bearer | — | `{ termsVersion, acceptedVersion, acceptedAt, mustAcceptTerms }` |
| POST | `/legal/terms/accept` | Bearer | `{ version }` | Same as above; idempotent; 409 = `version` is no longer current |

- The **PDF is the official document**; the server stores its SHA-256 with every acceptance. Never send a hash from the app.
- Only the Terms of Use are accepted. The Privacy Policy is shown/linked, never "accepted".
- Signup: show both links and a checkbox; send `acceptedTermsVersion` = `version` of `termo-de-uso` from `GET /legal`. Not current → 400 `validationErrors[/acceptedTermsVersion]`, account not created.
- Google (and Apple, when it exists): above the button show "Ao continuar, você aceita o Termo de Uso e a Política de Privacidade" with both links, and **always** send `acceptedTermsVersion`. The API records it only on the first acceptance of that version.
- `user.mustAcceptTerms: true` (session or `/auth/me`) → open the acceptance screen (older account, or a new Terms version) and call `POST /legal/terms/accept`. On 409, reload `GET /legal` and show the new version. The API does not block other routes for now.
- Settings screen: links to both public pages.

### 5.14 Delete own account

`DELETE /auth/me` with `{ "confirm": true }` (show a confirmation step first). Deletes the login (GoTrue: password and Google identity) and the account's own data: link to the condo record, settings, push subscriptions, registered devices and push preferences, and message reads. Keeps the Terms acceptance record and command logs (legitimate retention, Privacy Policy §11 and §14). The access token is rejected right after; clear the local session and go to the welcome screen.

- Staff accounts (`porteiro`, `sindico`, `admin`) → 403: removed by the administration.
- 503 → auth service unavailable, **nothing was deleted**; offer retry.
- Public instructions page (Google Play requirement): `https://novaresidence.com.br/excluir-conta`.

`/residence/me` → `person.cpfMasked` (`"•••.456.789-••"`, or `null`) for the personal data screen. The full CPF never leaves the API.

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
| `cie.active.updated` | staff + active residents | `{ type, items, counters }` — the full active list of one type (`alarme`, `falha`, `supervisao`, `bloqueio`) changed; replace that list |
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
- Not available yet (do not build against it): iOS push (APNs; the `/notifications/devices/ios` routes are placeholders), resident self-service for vehicles/gates, dashboard aggregate endpoint.
