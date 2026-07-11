# OAuth Auto-Username on Sign-In — Design

**Date:** 2026-07-09
**Status:** Approved design, pending implementation plan

## Problem

New users who sign in via an OAuth provider (Discord, GitHub, Twitch — web + mobile) have no `profile.username`. This is a recurring friction point: services re-derive junk nicks, the `kbve.com/@username` identity is empty, and users hit a bare "set a username" gate with no help. We want new users to either be handed a username automatically from their provider handle, or shown a friendly prompt only when auto-assignment is not possible.

## Goals

- After a new OAuth sign-in, attempt to claim the user's provider handle automatically.
- Support all three OAuth providers: Discord, GitHub, Twitch.
- On collision, retry with a random suffix (already-existing DB behavior).
- If auto-claim succeeds: tell the user with a non-blocking welcome toast.
- If auto-claim genuinely cannot produce a name: show a modal — "Hey! We need you to create a username?" — pre-filled with a sanitized suggestion.
- Ship the prompt as a React Native component first (`@kbve/rn`), so it works on mobile and on web via the `@kbve/rn-astro` bridge from one source.
- Converge the username validation rules so an auto-claimed name always round-trips through the manual set-username path.

## Non-Goals

- No new onboarding wizard beyond the username step.
- No changes to the legacy Astro/`profile-controller` auth stack (target modern `@kbve/core` + `@kbve/rn` only).
- No tightening of the DB `CHECK` constraints (avoids a migration against existing rows).
- No auto-claim from email-only / password sign-ups (no provider handle to seed from) — those fall straight to the modal.

## Existing Building Blocks (reuse, do not rebuild)

- **Detection:** `needsUsername = signedIn && username === null` — `packages/npm/core/src/auth.ts:191`. `username` comes from the `kbve_username` JWT claim (`packages/npm/rn/src/auth/supabase.web.ts:35-45`).
- **Gate + component:** `AuthGate` renders `SetUsernameScreen` when `needsUsername` — `packages/npm/rn/src/auth/AuthGate.tsx:20`. `SetUsernameScreen.tsx` already POSTs `/api/v1/profile/username`.
- **Auto-claim logic (SQL, Discord-specific):** `tracker.ensure_discord_username($user_id, $base, $discord_id)` — sanitizes the display name to `[a-z0-9_-]`, truncates to 24, takes a `pg_advisory_xact_lock`, and loops `profile.service_add_username` retrying with a random/snowflake suffix on `unique_violation`/banlist. Defined in `packages/data/sql/dbmate/migrations/20260616000000_tracker_provision_discord_user.sql` + `20260617210000_discord_username_random_suffix.sql`. Called only by the Discord Activity session bridge (`apps/kbve/axum-kbve/src/transport/discord_session.rs:245`). We generalize this (see Design §2a) rather than duplicating the retry loop in Rust — the advisory lock is what makes the claim atomic.
- **Backend profile service:** `axum-kbve` — routes in `src/transport/https.rs`, service in `src/db/profile.rs`. Has both a PostgREST client and a direct pg pool (discord_session uses direct SQL).
- **Identity data:** `get_user_all_providers` RPC (used by `get_profile_by_user_id`, `profile.rs:380-491`) exposes per-provider identity for **discord / github / twitch** (`global_name`/`full_name`/`preferred_username`/`user_name`/`name`). This is the source for both the base handle and the fallback id on the web path.
- **RN toast:** existing RN toast system (see `project_rn_toast_system`).

## Design

### 1. Username validation parity

Converge on a single rule = the DB rule (full parity, decided). Update Rust `validate_username` (`apps/kbve/axum-kbve/src/db/profile.rs:46-77`, regex line 15) to mirror `profile.normalize_username`:

- Trim, lowercase.
- Accept `^[a-z0-9_-]{3,63}$` (allow hyphens, allow leading digit, length 3–63).
- Drop the leading-letter requirement and the 24-char cap.
- Banlist + `xn--` rejection stay enforced by the DB on write (`service_add_username`); Rust surfaces the DB error as today.

Result: any name auto-claim writes is also acceptable to the manual `set_username` path, so a pre-filled suggestion always validates.

### 2a. Generalize the SQL claim function (provider-neutral)

New migration adding `tracker.ensure_oauth_username(p_user_id uuid, p_base text, p_fallback_id text) returns text` — a provider-neutral copy of `ensure_discord_username`:

- Same sanitize (`[a-z0-9_-]`, lowercase), same truncate-to-24, same `pg_advisory_xact_lock(hashtext(canonical))`, same `service_add_username` retry-with-random-suffix loop (6–8 attempts) on `unique_violation`/banlist.
- Fallback when the sanitized base is `< 3` chars: `user<digits-of-fallback_id>` (generic) instead of Discord's `chip<snowflake>`.
- `ensure_discord_username` stays as a thin wrapper delegating to `ensure_oauth_username` (Discord path keeps its `chip` fallback by passing a base that already survives, or we keep both — implementation detail; the Discord Activity bridge behavior must not change).

### 2b. Backend auto-claim endpoint (`axum-kbve`)

- New route: `POST /api/v1/profile/username/auto` → `auto_claim_username_handler` in `src/transport/https.rs`.
- Request body: `AutoClaimRequest { provider: Option<String> }` — optional hint of the provider the user just signed in with (`"discord"|"github"|"twitch"`).
- Auth: same token extraction/verification as `set_username_handler` (`token_info.user_id`).
- New `ProfileService::auto_claim_username(user_id, provider_hint)`:
  1. If the user already has a username → return `{ username, claimed: false }` (idempotent, no error).
  2. Resolve provider identities via the existing `get_user_all_providers` RPC. Pick the base handle: **the hinted provider first**, else priority `discord → github → twitch` among linked identities. Base handle per provider: Discord `global_name`→`user_name`; GitHub `user_name`/`preferred_username`→`name`; Twitch `preferred_username`/`user_name`→`name`. Fallback id = that provider's stable identity id.
  3. If no provider identity yields a usable base → return `{ username: null, claimed: false }`.
  4. Call `tracker.ensure_oauth_username(user_id, base, fallback_id)` via the direct pg pool (same pattern as `discord_session.rs`).
  5. Return `{ username, claimed: true }`.
- Base-handle extraction is a shared helper; `discord_session` keeps deriving its base from the live Discord API (only that source differs).

### 3. Client wiring (`@kbve/core` + `@kbve/rn`)

- In the `@kbve/core` auth store, when the user transitions to `signedIn && needsUsername` and auth-claim has not yet been attempted this session: dispatch a new `auto_claim_username` effect → `POST /api/v1/profile/username/auto`, passing the provider the user signed in with (tracked from the `sign_in_oauth` dispatch; may be undefined on session restore).
- On success: `refreshSession()` to pull the new `kbve_username` claim → `needsUsername` flips false → show welcome toast: "Welcome! Your username is @handle — change it in settings."
- On `{ claimed: false, username: null }` (no provider handle / unclaimable): leave `needsUsername = true` → the modal path (below) takes over.
- Guard against loops: attempt auto-claim at most once per session; a failed attempt does not retry automatically.

### 4. Prompt component (RN-first, `@kbve/rn`)

- Extend `SetUsernameScreen.tsx`:
  - Add a modal-presentation variant (dialog overlay) in addition to the existing full-screen gate use.
  - Add welcome copy: "Hey! We need you to create a username?"
  - Add a `suggestion` prop to pre-fill the field with a sanitized suggestion (must satisfy the converged regex).
- Renders on web via the existing `@kbve/rn-astro` bridge (`client:only="react"` island) — one source, mobile + web.
- Only shown when auto-claim did not resolve a username.

## Data Flow

```
OAuth sign-in (modern RN sign_in_oauth: discord | github | twitch)
  → session restored, JWT has no kbve_username → needsUsername = true
  → core auth store: signedIn + needsUsername + not-yet-attempted
      → POST /api/v1/profile/username/auto  { provider?: <sign-in provider> }
          backend: resolve provider handle (hint → discord→github→twitch)
                   → tracker.ensure_oauth_username (advisory lock, retry w/ random suffix)
          → { username, claimed }
  → claimed:      refreshSession() → needsUsername=false → welcome toast
  → not claimed:  needsUsername stays true → SetUsernameScreen modal ("Hey!…", prefilled suggestion)
```

## Error Handling

- No provider identity / email-only account → `{ claimed: false, username: null }` → modal (empty/suggestion field). Not an error.
- All suffix attempts exhausted/banned (rare) → treat as unclaimable → modal.
- Endpoint 401/token failure → treated like any auth failure; user stays gated, modal shows on next valid session.
- Manual submit still validates through the converged rule; DB banlist rejection surfaces as 409/400 as today.

## Testing

- **Rust unit:** `validate_username` parity — accepts hyphen, leading digit, up to 63 chars; rejects too-short/too-long/illegal chars; lowercases.
- **Rust unit:** base-handle resolver — hint wins; priority discord→github→twitch fallback; per-provider field extraction; returns None when no identity.
- **SQL:** `ensure_oauth_username` claims a free base; suffixes on collision; `user<id>` fallback for a too-short base; Discord bridge behavior unchanged.
- **Backend integration:** `/api/v1/profile/username/auto` — free handle claims; collision → suffixed claim; no identity → `{claimed:false,username:null}`; already-has-username → idempotent return; each provider (discord/github/twitch) seeds a handle.
- **Component:** `SetUsernameScreen` modal variant renders on web (headless Playwright per rn-web bridge), shows "Hey!" copy, pre-fills suggestion, submits successfully.
- **Client:** auto-claim effect fires once, not on repeat; success path shows toast + clears `needsUsername`.

## Open Risks / Notes

- Side-effect-on-first-sign-in: auto-claim runs once per session guarded in the store; ensure the guard survives session restore so it does not re-fire on every reload.
- Provider handle sources differ in shape; the base-handle resolver centralizes per-provider field priority so downstream code stays provider-agnostic.
- The DB CHECK stays looser than the API rule is now (they become equal); no migration required for validation parity. The only new migration is `ensure_oauth_username`.
