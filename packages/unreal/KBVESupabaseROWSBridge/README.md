# KBVESupabaseROWSBridge

Glue plugin that links a **KBVESupabase** sign-in to a **ROWS** session. The two
plugins are intentionally decoupled; this bridge is the one-way orchestration layer
that depends on both.

## What it does

On `UKBVESupabaseSubsystem::OnSignedIn` it:

1. `UROWSAuthSubsystem::AdoptSupabaseSession(AccessToken, User.Id, User.KbveUsername)` —
   stores the JWT in the ROWS core so every subsequent ROWS request carries
   `Authorization: Bearer <token>`.
2. `UROWSAuthSubsystem::ExternalLoginAndCreateSession(AccessToken)` — mints a ROWS
   `UserSessionGUID` against `POST /api/Users/ExternalLoginAndCreateSession`.

The resulting GUID is surfaced via `OnSupabaseRowsLinked`; failures via
`OnSupabaseRowsLinkFailed`. Sign-out clears the ROWS Supabase session.

## Usage

Enable the plugin (it pulls in `KBVESupabase` + `KBVEROWS`). The bridge is a
`UGameInstanceSubsystem` and auto-links on sign-in — no code required for the happy
path. To react to the result:

```cpp
auto* Bridge = GetGameInstance()->GetSubsystem<USupabaseRowsBridgeSubsystem>();
Bridge->OnSupabaseRowsLinked.AddDynamic(this, &UMyHud::HandleRowsReady);    // FString UserSessionGUID
Bridge->OnSupabaseRowsLinkFailed.AddDynamic(this, &UMyHud::HandleRowsError); // FString ErrorMessage

auto* Sb = GetGameInstance()->GetSubsystem<UKBVESupabaseSubsystem>();
Sb->SignInWithPassword(Email, Password); // or StartOAuthSignIn(...)
```

For a session restored from a persisted refresh token, drive it manually after the
restore completes:

```cpp
Bridge->LinkCurrentSupabaseSession();
```

`SetAutoLinkEnabled(false)` disables the automatic `OnSignedIn` hook if you want to
control linking yourself.

## Notes

- `AdoptSupabaseSession` broadcasts ROWS `OnLoginSuccess` synchronously with the
  Supabase user id; the bridge ignores that and only reports the real ROWS
  `UserSessionGUID` returned by `ExternalLoginAndCreateSession`.
- The tenant `X-CustomerGUID` header is still supplied by the ROWS core config; this
  bridge only handles the player identity (Supabase UUID).
