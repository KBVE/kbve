# KBVESupabase

Supabase integration for Unreal Engine 5. GoTrue auth (email/password, OAuth, magic-link OTP), JWT storage with auto-refresh, PostgREST helpers, and account management. Drop-in account layer for KBVE games.

## Features

- **Auth** — email + password sign-in/sign-up, anonymous sign-in, magic-link OTP (email + SMS phone), password recovery, full OAuth (Google/GitHub/Discord/Twitch/Apple/Azure) via PKCE + RFC 8252 loopback.
- **Session management** — refresh-token timer (`RefreshLeadSeconds` before expiry), persistent disk session per-project at `<ProjectSaved>/KBVESupabase/<slug>.session.json`, automatic refresh + retry on HTTP 401 for managed calls.
- **JWT** — client-side claims decode (no signature verification — server-side responsibility); `kbve_username` hoisted out of `user_metadata` / `app_metadata` to match the GoTrue Custom Access Token hook used by `kbve.com`.
- **Storage** — `UKBVESupabaseStorage` subobject: upload bytes/file, download bytes/file, list, sign URL, remove, move, copy, public URL helper.
- **Database (PostgREST)** — `DbSelect` / `DbInsert` / `DbUpdate` / `DbDelete` / `DbUpsert` / `DbRpc` helpers; raw `RestRequest` for ad-hoc.
- **Edge Functions** — `InvokeFunction(name, body)` hits `/functions/v1/<name>` with bearer.
- **Chat** — `UKBVESupabaseChat` subobject: WebSocket client for the KBVE irc-gateway (`chat.kbve.com/ws`). JWT injected on upgrade, auto-PONG, exponential-backoff reconnect, IRC line parser + PRIVMSG envelope extraction.
- **DeveloperSettings** at _Project Settings → Plugins → KBVE Supabase_ — URLs, paths, persistence, refresh lead, timeout, OAuth loopback port range + HTML, chat URL + auto-join.
- **Blueprint-friendly** — every public method `UFUNCTION(BlueprintCallable)`, all delegates `BlueprintAssignable`.

## Add to a project

1. Copy or symlink this plugin into `Plugins/KBVESupabase` of the target `.uproject`.
2. Regenerate project files; open the editor.
3. _Project Settings → Plugins → KBVE Supabase_:
    - `Project URL` — `https://<ref>.supabase.co` (or self-hosted gateway).
    - `Anon Key` — public anon JWT from the Supabase dashboard.
4. Enable the plugin and restart.

## C++ usage

```cpp
#include "KBVESupabaseSubsystem.h"

UKBVESupabaseSubsystem* Sb = GetGameInstance()->GetSubsystem<UKBVESupabaseSubsystem>();
Sb->OnSignedIn.AddDynamic(this, &UMyClass::HandleSignedIn);
Sb->OnAuthError.AddDynamic(this, &UMyClass::HandleAuthError);

Sb->SignInWithPassword(TEXT("user@example.com"), TEXT("hunter2"));
```

After sign-in:

```cpp
const FKBVESupabaseSession& S = Sb->GetSession();
const FString Bearer = Sb->GetAccessToken();
const FString Username = S.User.KbveUsername;
```

## Blueprint usage

- `Get Game Instance Subsystem` → `KBVESupabaseSubsystem`.
- Call `Sign In With Password`, `Sign Up With Password`, `Sign In With Otp`, `Verify Otp`, `Sign Out`, etc.
- Bind delegates `On Signed In`, `On Signed Out`, `On Session Refreshed`, `On Auth Error`, `On Auth Status Changed`.

## OAuth flow (loopback + PKCE)

`StartOAuthSignIn(Provider, Scopes)` runs the full RFC 8252 native-app flow:

1. Generate a PKCE verifier (32 random bytes, base64url) + challenge (S256) + CSRF `state`.
2. Bind the first free port in the configured loopback range on `127.0.0.1` via the engine HttpServer; register a single `GET <CallbackPath>` route.
3. Open the system browser at `<ProjectURL>/auth/v1/authorize?provider=X&flow_type=pkce&redirect_to=http://127.0.0.1:<port><path>&code_challenge=...&state=...`.
4. User auths with the provider; GoTrue redirects back to the loopback with `?code=...&state=...`.
5. Plugin validates `state`, then `POST /token?grant_type=pkce` with `{auth_code, code_verifier}`.
6. On 200, session is applied + persisted + `OnSignedIn` fires.

```cpp
UKBVESupabaseSubsystem* Sb = GetGameInstance()->GetSubsystem<UKBVESupabaseSubsystem>();
FKBVESupabaseOAuthStartResult Start = Sb->StartOAuthSignIn(EKBVESupabaseOAuthProvider::Discord, TEXT(""));
// Start.AuthorizeURL is the URL the browser was launched at — useful to log / display.
```

`CancelOAuthSignIn()` unbinds the route + drops the PKCE state without firing an error.

### Supabase project setup

Pre-register every loopback URL in the dashboard at _Auth → URL Configuration → Redirect URLs_. The plugin's default range is `3450-3460` so:

```
http://127.0.0.1:3450/auth/callback
http://127.0.0.1:3451/auth/callback
...
http://127.0.0.1:3460/auth/callback
```

Per-provider settings (Auth → Providers): enable PKCE flow if your version exposes it as a per-provider toggle.

### Why a fixed range?

OS-assigned (`port 0`) means the redirect URI changes every launch, which forces a wildcard in Supabase (`http://127.0.0.1:*`). Many tenants don't allow wildcards, and macOS pops a firewall prompt on every new port. A small fixed range works once and stays quiet.

### Without loopback

`BuildOAuthAuthorizeURL(Provider, RedirectTo, Scopes)` still exists for cases where the redirect target is your own deep link / web callback. The hash-fragment implicit flow (`access_token` in URL fragment) only works in a browser — not from a loopback HTTP listener — so always pass `flow_type=pkce` when targeting the loopback yourself.

## Database (PostgREST) helpers

```cpp
// SELECT
Sb->DbSelect(TEXT("profiles"),
    TEXT("select=username,avatar_url&id=eq.") + Sb->GetUser().Id,
    FKBVESupabaseStringCallback::CreateUObject(this, &UMyClass::OnProfile));

// INSERT (returns inserted row)
Sb->DbInsert(TEXT("scores"),
    TEXT("{\"player\":\"...\",\"score\":1234}"),
    /*bReturnRepresentation=*/true, Cb);

// UPDATE
Sb->DbUpdate(TEXT("profiles"),
    TEXT("id=eq.") + Sb->GetUser().Id,
    TEXT("{\"avatar_url\":\"https://...\"}"),
    /*bReturnRepresentation=*/false, Cb);

// DELETE
Sb->DbDelete(TEXT("invites"), TEXT("token=eq.xyz"), Cb);

// UPSERT
Sb->DbUpsert(TEXT("profiles"), Body, TEXT("id"), /*bReturnRepresentation=*/true, Cb);

// RPC
Sb->DbRpc(TEXT("get_leaderboard"), TEXT("{\"limit\":10}"), Cb);
```

All Db helpers route through `DispatchAuthedRequest` — `apikey` + bearer, auto-refresh + retry on 401.

## Edge Functions

```cpp
Sb->InvokeFunction(TEXT("hello-world"),
    TEXT("{\"name\":\"chuck\"}"),
    FKBVESupabaseStringCallback::CreateUObject(this, &UMyClass::OnFnReply));
```

Hits `<ProjectURL>/functions/v1/hello-world` with bearer + `application/json`.

## Storage

```cpp
UKBVESupabaseStorage* S = Sb->GetStorage();

// Upload raw bytes
S->UploadBytes(TEXT("avatars"), TEXT("user.png"), Bytes, TEXT("image/png"), /*bUpsert=*/true, Cb);

// Upload a local file (auto-detects content type by extension)
S->UploadFile(TEXT("avatars"), TEXT("user.png"), FullDiskPath, FString(), true, Cb);

// Download bytes
S->Download(TEXT("avatars"), TEXT("user.png"),
    FKBVESupabaseBytesCallback::CreateUObject(this, &UMyClass::OnBytes));

// Download to disk
S->DownloadToFile(TEXT("avatars"), TEXT("user.png"), TargetDiskPath, SimpleCb);

// Create a signed URL (valid for 1 hour)
S->CreateSignedURL(TEXT("avatars"), TEXT("user.png"), 3600, Cb);

// Public bucket URL (no request — built locally)
FString PublicURL = S->GetPublicURL(TEXT("public-art"), TEXT("logo.png"));

// List, remove, move, copy also available.
```

## Generic REST helper

`RestRequest(verb, endpoint, body, callback)` is raw passthrough — `apikey` + bearer only, no auto-refresh, no retry. Endpoints beginning with `/auth/` go to GoTrue; everything else goes to PostgREST. Use the typed helpers above for managed behavior.

## Chat (irc-gateway WebSocket)

Wraps the KBVE chat gateway at `wss://chat.kbve.com/ws`. The plugin sends the active Supabase access token as `Authorization: Bearer ...` on the WS upgrade; the gateway derives the IRC nick from the JWT (`kbve_username`) and pre-registers the user, so the client only needs to JOIN / PRIVMSG / PART.

```cpp
UKBVESupabaseChat* Chat = Sb->GetChat();

Chat->OnConnected.AddDynamic(this, &UMyClass::HandleChatConnected);
Chat->OnMessage.AddDynamic(this, &UMyClass::HandleChatMessage);
Chat->OnStatusChanged.AddDynamic(this, &UMyClass::HandleChatStatus);

Chat->Connect();                       // uses access_token + Settings.ChatURL
// after OnConnected fires, auto-join channels from Settings.ChatAutoJoinChannels
Chat->JoinChannel(TEXT("#world-events"));
Chat->SendPrivMsg(TEXT("#global"), TEXT("hello from UE"));
```

### Message envelope

PRIVMSG bodies sent by the gateway follow the form `[KIND] sender@platform: content`. The plugin's `ExtractChatMessage` splits them into `FKBVEChatMessage`:

| Field    | Example                    |
| -------- | -------------------------- |
| Channel  | `#global`                  |
| Nick     | `Player1`                  |
| Sender   | `Player1`                  |
| Platform | `discord`                  |
| Kind     | `CHAT`, `EVENT:KILL`, ...  |
| Body     | `hello`                    |
| bIsEvent | `Kind.StartsWith("EVENT")` |

Raw IRC lines are also exposed via `OnRawLine` (`FKBVEChatIrcLine` — Prefix / Sender / Command / Params / Trailing) for clients that want full control.

### Auto-reconnect

`bChatAutoReconnect` is on by default. On close or error, the plugin retries with `ChatReconnectInitialDelaySeconds × 2^attempt` backoff, capped at `ChatReconnectMaxDelaySeconds`. Call `Disconnect()` explicitly to stop reconnecting.

### Sign-out behaviour

`SignOut()` calls `Chat->Disconnect()` so the WS doesn't outlive the session.

## JWT decode

```cpp
FKBVESupabaseJWTClaims Claims;
if (Sb->DecodeAccessTokenClaims(Claims)) {
    UE_LOG(LogTemp, Log, TEXT("Signed in as %s (role %s)"), *Claims.Sub, *Claims.Role);
}
FDateTime ExpiresAt = Sb->GetAccessTokenExpiresAt();
```

`Decode` does **not** verify the signature — Supabase enforces signature server-side. Use the claims for UX hints only, never for security gating.

## Session file

- Path: `FPaths::ProjectSavedDir() / KBVESupabase / <slug>.session.json`.
- Slug: `Project Settings → ProjectSlug`, or auto-hash of `ProjectURL`.
- Set `Persist Session = false` in settings to keep tokens memory-only.
- Trust boundary is the OS user account / FDE. At-rest encryption (DPAPI / Keychain) can be added per-platform later.

## Dependencies

`Core`, `CoreUObject`, `Engine`, `HTTP`, `HTTPServer`, `Json`, `JsonUtilities`, `DeveloperSettings`, `WebSockets`; private: `Sockets`, `Networking`. No third-party libs (SHA-256 is a self-contained FIPS 180-4 reference impl in `KBVESupabasePKCE.cpp`).

## License

Part of the KBVE monorepo — see repo root.
