# KBVESupabase

Supabase integration for Unreal Engine 5. GoTrue auth (email/password, OAuth, magic-link OTP), JWT storage with auto-refresh, PostgREST helpers, and account management. Drop-in account layer for KBVE games.

## Features

- **Email + password sign-in / sign-up** via GoTrue `/token?grant_type=password` and `/signup`.
- **Magic-link OTP** via `/otp` + `/verify`.
- **OAuth bootstrap URL** for Google / GitHub / Discord / Twitch / Apple / Azure (host browser handles the callback).
- **Refresh token rotation** with an automatic timer that fires `RefreshLeadSeconds` before expiry.
- **Per-project session persistence** at `<ProjectSaved>/KBVESupabase/<slug>.session.json`. Survives game restarts.
- **`kbve_username` claim hoisted** out of `user_metadata` / `app_metadata` for direct access (matches the GoTrue Custom Access Token hook used by `kbve.com`).
- **Generic `RestRequest`** for PostgREST + Edge Functions — auto-attaches `apikey` and bearer token.
- **DeveloperSettings page** at _Project Settings → Plugins → KBVE Supabase_.

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

## Generic REST helper

```cpp
Sb->RestRequest(
    TEXT("GET"),
    TEXT("/profiles?select=username,avatar_url&id=eq.") + Sb->GetUser().Id,
    TEXT(""),
    FKBVESupabaseStringCallback::CreateUObject(this, &UMyClass::OnProfile));
```

Passes through `apikey` + `Authorization: Bearer <access_token>` headers, hitting `<ProjectURL>/rest/v1/...`. For Edge Functions, point `Endpoint` at the function path; for raw `/auth/v1/*` calls, prefix with `/auth/`.

## Session file

- Path: `FPaths::ProjectSavedDir() / KBVESupabase / <slug>.session.json`.
- Slug: `Project Settings → ProjectSlug`, or auto-hash of `ProjectURL`.
- Set `Persist Session = false` in settings to keep tokens memory-only.
- Trust boundary is the OS user account / FDE. At-rest encryption (DPAPI / Keychain) can be added per-platform later.

## Dependencies

`Core`, `CoreUObject`, `Engine`, `HTTP`, `HTTPServer`, `Json`, `JsonUtilities`, `DeveloperSettings`; private: `Sockets`, `Networking`. No third-party libs (SHA-256 is a self-contained FIPS 180-4 reference impl in `KBVESupabasePKCE.cpp`).

## License

Part of the KBVE monorepo — see repo root.
