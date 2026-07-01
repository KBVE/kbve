# RentEarth ↔ ARPG Agones Multiplayer — Phase 4: Shortcut Login + Live Point

**Date:** 2026-07-01
**Status:** Approved (design)
**Scope:** Phase 4 of the rentearth ARPG multiplayer effort. Adds an in-client username-setup gate for first-time players, refreshes the session so the JWT carries the `kbve_username` claim, and points the client at the live Agones ARPG ingress. Builds on merged KBVESimgrid (transport, #13626), KBVESimgridRender (render, #13629), and Phase 3 ephemeral events (#13632).

## Goal

A signed-in player who already has a username flows straight into the live ARPG. A first-time player (no username) sets one in-client, the client persists it via the axum-kbve profile endpoint, refreshes the Supabase session to mint a JWT carrying the `kbve_username` claim, then enters. The client connects to the live fixed ingress `wss://arpg.kbve.com/ws` instead of localhost.

## Prior Art (do not rewrite)

- **KBVESupabase** (`packages/unreal/KBVESupabase/`) — `UKBVESupabaseSubsystem`:
  - `FString GetAccessToken() const` — current bearer JWT.
  - `const FKBVESupabaseUser& GetUser() const` — session user; `FKBVESupabaseUser.KbveUsername` (empty when unset).
  - `EKBVESupabaseAuthStatus GetStatus()`, `bool IsSignedIn()`, `void RefreshSession()`.
  - Delegates: `OnSignedIn`, `OnSignedOut`, `OnSessionRefreshed`, `OnAuthStatusChanged`.
  - `KbveUsername` is populated from the decoded JWT claim (`FKBVESupabaseJWTClaims.KbveUsername`), which the Supabase access-token hook injects from the canonical profile store. Setting a username therefore requires a write to that store **followed by** a session refresh to re-mint the token.
- **SKBVELoginWidget** (`packages/unreal/KBVEUI/Source/KBVEUIAuth/`) — existing Slate login (email/pass/OAuth/anon). Reference for widget style.
- **AchuckMenuPlayerController** (`apps/rentearth/unreal-rentearth/Source/chuck/UI/`) — menu PC; `BeginPlay` checks `IsSignedIn()`, `RefreshAuthVisibility()` toggles login vs account widgets in the viewport.
- **AchuckSimgridController** (`apps/rentearth/unreal-rentearth/Source/chuck/Net/`) — `BeginPlay` calls `USimgridClientSubsystem::ConnectToServer(ServerUrl)`; `ServerUrl` is an `EditDefaultsOnly` `FString`, currently `ws://localhost:7979/ws`.
- **USimgridClientSubsystem** (`packages/unreal/KBVENet/Source/KBVESimgrid/`) — captures `GetUser().KbveUsername` into `PendingUsername` and `GetAccessToken()` into `PendingJwt` at connect, sends both in `EncodeJoinMatch`.

## axum-kbve Profile Endpoint (wire contract)

`POST /api/v1/profile/username`

- **Auth:** `Authorization: Bearer <access token>` (required).
- **Body:** `{"username": "<name>"}`.
- **Responses:**
  - `200` → `{"success": true, "username": "<canonical>", "message": "..."}` — set OK.
  - `400` → invalid username format.
  - `401` → missing/invalid/expired token.
  - `409` → username already taken.
  - `503` → auth or profile service unavailable.
- **Base host:** production `https://kbve.com`; local dev `http://localhost:4321`.

## Live ARPG Endpoint

`wss://arpg.kbve.com/ws` — fixed ingress (Cilium gateway HTTPRoute → `arpg-game:7979`, 3600s WS timeout). Not per-match allocation; the hostname is stable while the Agones fleet scales behind it. Local dev override remains `ws://localhost:7979/ws`.

## Components (all in the rentearth `chuck` fork — do not touch main chuck)

### `UchuckKbveApiClient` (new, `GameInstanceSubsystem`)
- Wraps `FHttpModule`. Base URL is an `UPROPERTY(EditDefaultsOnly)` / config-backed `FString` (`BaseUrl`, default `https://kbve.com`; set `http://localhost:4321` for local dev).
- `void SetUsername(const FString& Name, TFunction<void(EchuckSetUsernameResult, const FString& Canonical)> OnResult)` — issues `POST {BaseUrl}/api/v1/profile/username`, header `Authorization: Bearer <UKBVESupabaseSubsystem::GetAccessToken()>`, content-type `application/json`, body `{"username":"<Name>"}`. On completion, maps to a result and invokes `OnResult` on the game thread.
- **Pure parse function (unit-tested):** `static EchuckSetUsernameResult ParseSetUsernameResult(int32 HttpCode, const FString& Body, FString& OutCanonical)`.
  - `200` → `Ok`, `OutCanonical` = parsed `username` field (falls back to the requested name if absent).
  - `400` → `Invalid`.
  - `401` → `Unauthorized`.
  - `409` → `Taken`.
  - `503` → `ServerError`.
  - any other code → `ServerError`.
- Transport failure (no HTTP response / `bConnectedSuccessfully == false`) → `NetworkError` (decided in the completion handler, not the pure fn).
- `enum class EchuckSetUsernameResult : uint8 { Ok, Taken, Invalid, Unauthorized, ServerError, NetworkError }`.

### `SchuckUsernameSetup` (new Slate widget)
- Editable text box (username), Confirm button, status text block. Styled after `SKBVELoginWidget`.
- Confirm → disable input + button, set status "Setting…", call `UchuckKbveApiClient::SetUsername`.
  - `Ok` → call `UKBVESupabaseSubsystem::RefreshSession()`, then fire `OnUsernameSet` delegate (menu proceeds on the subsequent `OnSessionRefreshed`).
  - `Taken` → status "Username taken — try another", re-enable.
  - `Invalid` → status "Invalid username", re-enable.
  - `Unauthorized` → fire `OnSessionExpired` delegate (menu returns to login).
  - `ServerError` / `NetworkError` → status "Server unavailable — try again", re-enable.
- Exposes `FSimpleDelegate OnUsernameSet` and `FSimpleDelegate OnSessionExpired` for the menu PC to bind.

### `AchuckMenuPlayerController` gate (extend existing)
- `RefreshAuthVisibility()` becomes 3-state:
  - not signed in → show `SKBVELoginWidget`, hide the rest.
  - signed in **and** `GetUser().KbveUsername.IsEmpty()` → show `SchuckUsernameSetup`, hide login/play.
  - signed in **and** username present → show the Play/account path.
- Bind `UKBVESupabaseSubsystem::OnSignedIn` and `OnSessionRefreshed` → `RefreshAuthVisibility()`. Bind `SchuckUsernameSetup::OnSessionExpired` → drop back to the login state (sign-out or re-show login).
- Construct `SchuckUsernameSetup` lazily alongside the existing login widget in the viewport stack.

### Live server point (edit existing)
- `AchuckSimgridController::ServerUrl` default → `wss://arpg.kbve.com/ws`. Keep `EditDefaultsOnly` so a local build can override to `ws://localhost:7979/ws` in a Blueprint/instance without code change.

## Data Flow

```
Menu BeginPlay → UKBVESupabaseSubsystem status
  Unauth              → SKBVELoginWidget → SignInWithPassword → OnSignedIn ──┐
  Auth, KbveUsername="" → SchuckUsernameSetup → POST /api/v1/profile/username │
                          200 → RefreshSession → OnSessionRefreshed ──────────┤
  Auth, KbveUsername set → Play → OpenLevel(gameplay)                          │
                          → AchuckSimgridController::BeginPlay                 │
                          → ConnectToServer("wss://arpg.kbve.com/ws")          │
                          → EncodeJoinMatch(JWT, KbveUsername)                 │
        └──────────────────── RefreshAuthVisibility recheck ──────────────────┘
```

## Error Handling

- `SetUsername` `409` → "taken", re-enable field. `400` → "invalid", re-enable. `401` → session expired → menu returns to login. `503`/transport → "server unavailable — try again", re-enable.
- `RefreshSession()` failure → `OnSessionRefreshed` still recomputes visibility; if `KbveUsername` is still empty the username widget simply stays shown with a status. No crash.
- Live connect failure (server down / ns provisioning gaps → `/ws` 503, or a `Reject` frame) surfaces through the existing `USimgridClientSubsystem` `OnRejected` / `OnDisconnected` path; the menu/gameplay HUD shows the existing disconnect messaging. No new handling in this phase.

## Testing

- **`ParseSetUsernameResult` automation tests** (`chuck.KbveApi.*`, guarded `#if WITH_DEV_AUTOMATION_TESTS`) — one assertion per branch:
  - `200` body `{"success":true,"username":"chad","message":"ok"}` → `Ok`, canonical `"chad"`.
  - `200` body with no `username` field, requested `"chad"` → `Ok`, canonical `"chad"`.
  - `400` → `Invalid`. `401` → `Unauthorized`. `409` → `Taken`. `503` → `ServerError`. `500` → `ServerError`.
- **Widget / menu / live point** — compile-verified in `rentearthEditor` + manual integration: fresh account → username screen → set → enter → confirm connect to `wss://arpg.kbve.com/ws` and render/events live (as in prior phases).

## Out of Scope (Phase 5)

- Packaging / notarize / shippable build (bundle id, `chuckrpg://` scheme, cvar bake pre-sign).
- Username availability GET pre-check (`GET /api/v1/profile/{username}`) — this phase handles `409` on submit only.
- Username edit/change UI (only first-time set).
- Matchmaker / Agones allocation flow (fixed ingress used).
- Offline / hybrid mode (deferred Phase 2 item).

## Definition of Done

- `UchuckKbveApiClient` posts to `/api/v1/profile/username` with bearer auth; `ParseSetUsernameResult` covers all documented codes; automation tests pass.
- `SchuckUsernameSetup` widget drives set → refresh → proceed, with the documented error messaging.
- `AchuckMenuPlayerController` gates login → username → play on the three auth states, bound to the Supabase delegates.
- `AchuckSimgridController::ServerUrl` defaults to `wss://arpg.kbve.com/ws`.
- Module compiles in `rentearthEditor`; `chuck.KbveApi.*` tests green.
