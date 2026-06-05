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

## OAuth flow

`BuildOAuthAuthorizeURL(Provider, RedirectTo, Scopes)` returns the GoTrue authorize URL. Open it in the host browser (`FPlatformProcess::LaunchURL`) and let GoTrue handle the provider hand-off. After redirect, capture the URL fragment (`access_token` + `refresh_token` + `expires_in`) and call `SignInWithRefreshToken` — or simply let the redirect target be a deep link that the game intercepts.

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

`Core`, `CoreUObject`, `Engine`, `HTTP`, `Json`, `JsonUtilities`, `DeveloperSettings`. No third-party libs.

## License

Part of the KBVE monorepo — see repo root.
