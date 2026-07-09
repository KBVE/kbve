# Discord Auto-Username on Sign-In — Design

**Date:** 2026-07-09
**Status:** Approved design, pending implementation plan

## Problem

New users who sign in via Discord (web + mobile) have no `profile.username`. This is a recurring friction point: services re-derive junk nicks, the `kbve.com/@username` identity is empty, and users hit a bare "set a username" gate with no help. We want new Discord users to either be handed a username automatically, or shown a friendly prompt only when auto-assignment is not possible.

## Goals

- After a new Discord sign-in, attempt to claim the user's Discord handle automatically.
- On collision, retry with a random suffix (already-existing DB behavior).
- If auto-claim succeeds: tell the user with a non-blocking welcome toast.
- If auto-claim genuinely cannot produce a name: show a modal — "Hey! We need you to create a username?" — pre-filled with a sanitized suggestion.
- Ship the prompt as a React Native component first (`@kbve/rn`), so it works on mobile and on web via the `@kbve/rn-astro` bridge from one source.
- Converge the username validation rules so an auto-claimed name always round-trips through the manual set-username path.

## Non-Goals

- No new onboarding wizard beyond the username step.
- No changes to the legacy Astro/`profile-controller` auth stack (target modern `@kbve/core` + `@kbve/rn` only).
- No tightening of the DB `CHECK` constraints (avoids a migration against existing rows).

## Existing Building Blocks (reuse, do not rebuild)

- **Detection:** `needsUsername = signedIn && username === null` — `packages/npm/core/src/auth.ts:191`. `username` comes from the `kbve_username` JWT claim (`packages/npm/rn/src/auth/supabase.web.ts:35-45`).
- **Gate + component:** `AuthGate` renders `SetUsernameScreen` when `needsUsername` — `packages/npm/rn/src/auth/AuthGate.tsx:20`. `SetUsernameScreen.tsx` already POSTs `/api/v1/profile/username`.
- **Auto-claim logic (SQL):** `tracker.ensure_discord_username($user_id, $base, $discord_id)` — sanitizes the Discord display name to `[a-z0-9_-]`, truncates to 24, and loops `profile.service_add_username` retrying with a random/snowflake suffix on `unique_violation`/banlist. Defined in `packages/data/sql/dbmate/migrations/20260616000000_tracker_provision_discord_user.sql` + `20260617210000_discord_username_random_suffix.sql`. **Currently only called by the Discord Activity session bridge** (`apps/kbve/axum-kbve/src/transport/discord_session.rs:245`) — NOT by the normal web/mobile Discord OAuth flow. This is the gap.
- **Backend profile service:** `axum-kbve` — routes in `src/transport/https.rs`, service in `src/db/profile.rs`. Has both a PostgREST client and a direct pg pool (discord_session uses direct SQL).
- **Identity data:** `get_user_all_providers` RPC (used by `get_profile_by_user_id`, `profile.rs:380-491`) exposes Discord `global_name`/`full_name`/`preferred_username` etc. Source for the base name + discord_id on the web path.
- **RN toast:** existing RN toast system (see `project_rn_toast_system`).

## Design

### 1. Username validation parity

Converge on a single rule = the DB rule (full parity, decided). Update Rust `validate_username` (`apps/kbve/axum-kbve/src/db/profile.rs:46-77`, regex line 15) to mirror `profile.normalize_username`:

- Trim, lowercase.
- Accept `^[a-z0-9_-]{3,63}$` (allow hyphens, allow leading digit, length 3–63).
- Drop the leading-letter requirement and the 24-char cap.
- Banlist + `xn--` rejection stay enforced by the DB on write (`service_add_username`); Rust surfaces the DB error as today.

Result: any name auto-claim writes is also acceptable to the manual `set_username` path, so a pre-filled suggestion always validates.

### 2. Backend auto-claim endpoint (`axum-kbve`)

- New route: `POST /api/v1/profile/username/auto` → `auto_claim_username_handler` in `src/transport/https.rs`.
- Auth: same token extraction/verification as `set_username_handler` (`token_info.user_id`).
- New `ProfileService::auto_claim_username(user_id)`:
  1. Resolve the caller's Discord identity (base display name + discord_id) via the existing `get_user_all_providers` RPC. If no Discord identity → return `{ username: null, claimed: false }`.
  2. Call `tracker.ensure_discord_username(user_id, base, discord_id)` via the direct pg pool (same pattern as `discord_session.rs`).
  3. Return `{ username, claimed: true }` on success.
- Idempotent: if the user already has a username, return it with `claimed: false` (no error).
- Base-name derivation is shared with `discord_session` where practical (extract a helper; discord_session derives base from the live Discord API, the web path derives it from the providers RPC — only the source differs, the sanitize/claim core is shared).

### 3. Client wiring (`@kbve/core` + `@kbve/rn`)

- In the `@kbve/core` auth store, when the user transitions to `signedIn && needsUsername` and the provider is Discord and auto-claim has not yet been attempted this session: dispatch a new `auto_claim_username` effect → `POST /api/v1/profile/username/auto`.
- On success: `refreshSession()` to pull the new `kbve_username` claim → `needsUsername` flips false → show welcome toast: "Welcome! Your username is @handle — change it in settings."
- On `{ claimed: false, username: null }` (no identity / unclaimable): leave `needsUsername = true` → the modal path (below) takes over.
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
Discord OAuth (modern RN sign_in_oauth)
  → session restored, JWT has no kbve_username → needsUsername = true
  → core auth store: signedIn + needsUsername + provider=discord, not-yet-attempted
      → POST /api/v1/profile/username/auto
          backend: resolve Discord identity → tracker.ensure_discord_username (retry w/ random suffix)
          → { username, claimed }
  → claimed:      refreshSession() → needsUsername=false → welcome toast
  → not claimed:  needsUsername stays true → SetUsernameScreen modal ("Hey!…", prefilled suggestion)
```

## Error Handling

- No Discord identity on the account → `{ claimed: false, username: null }` → modal (empty/suggestion field). Not an error.
- All suffix attempts exhausted/banned (rare) → treat as unclaimable → modal.
- Endpoint 401/token failure → treated like any auth failure; user stays gated, modal shows on next valid session.
- Manual submit still validates through the converged rule; DB banlist rejection surfaces as 409/400 as today.

## Testing

- **Rust unit:** `validate_username` parity — accepts hyphen, leading digit, up to 63 chars; rejects too-short/too-long/illegal chars; lowercases.
- **Rust unit:** base-name sanitize helper (shared with discord_session).
- **Backend integration:** `/api/v1/profile/username/auto` — free handle claims; collision → suffixed claim; no Discord identity → `{claimed:false,username:null}`; already-has-username → idempotent return.
- **Component:** `SetUsernameScreen` modal variant renders on web (headless Playwright per rn-web bridge), shows "Hey!" copy, pre-fills suggestion, submits successfully.
- **Client:** auto-claim effect fires once, not on repeat; success path shows toast + clears `needsUsername`.

## Open Risks / Notes

- Side-effect-on-first-sign-in: auto-claim runs once per session guarded in the store; ensure the guard survives session restore so it does not re-fire on every reload.
- Discord scope difference between stacks (legacy requests `guilds`, modern requests `identify email`) does not affect this feature — only `identify` (username/global_name) is needed.
- The DB CHECK stays looser than the API rule is now (they become equal); no migration required.
