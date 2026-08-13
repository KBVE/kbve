# SQL_DUNGEON — proposed schema work for cross-door dungeon play

**Status: proposal. Nothing here has been applied to any database, and no migration file exists on this branch.**

Goal: let one player reach one dungeon profile from either door — the Discord bot or the telnet BBS — without changing how the game saves today.

This document exists because the schema work ran ahead of the rendering work. The SQL below was drafted and verified against the kilobase prod-replica image, then deliberately pulled back out of the branch so a migration can't land before the BBS dungeon client is real. Write the migration when the client needs it, not before.

Related: [DISCORDSH_PLAN.md](./DISCORDSH_PLAN.md), [DISCORDSH_GAMEIDEA.md](./DISCORDSH_GAMEIDEA.md).

---

## Where things stand today

The identity plumbing is further along than it looks. Already in place:

| Piece | Where |
|---|---|
| `auth.identities` rows with `provider='discord'`, `provider_id` = snowflake | Supabase auth |
| `tracker.find_claim_identity_by_discord_id(TEXT)` → `user_id` | `20260523033932` |
| `dungeon_profiles.auth_user_id UUID UNIQUE` + index | `20260409210000` |
| `service_load_profile_by_auth(UUID)` | `20260409210000` |
| `service_link_auth(BIGINT, UUID)` | `20260409210000` |
| `service_claim_mode` / `service_release_mode` mode lock | `20260409210000` |

`service_load_profile_by_auth` and `service_link_auth` currently have **zero Rust callers** — they were built for the isometric client and never wired up.

So the remaining work is smaller than "add cross-play identity". It is four specific gaps.

---

## Gap 1 — `active_mode` has no `'bbs'` value

`20260409210000` defines:

```sql
active_mode TEXT CHECK (active_mode IS NULL OR active_mode IN ('discord', 'isometric'))
```

### Trap: widening the CHECK is not enough

`service_claim_mode` validates the mode **in its own PL/pgSQL body, before touching the table**:

```sql
IF p_mode NOT IN ('discord', 'isometric') THEN
    RETURN QUERY SELECT false, NULL::TEXT, 'Invalid mode (must be discord or isometric).'::TEXT;
    RETURN;
END IF;
```

Widen only the constraint and a `'bbs'` claim still fails with `Invalid mode` — the constraint is never reached. This was caught in testing, not review; the first draft widened the CHECK alone and the claim silently refused.

Both edits are required:

```sql
ALTER TABLE discordsh.dungeon_profiles
    DROP CONSTRAINT dungeon_profiles_active_mode_check;  -- name is catalog-assigned, resolve it dynamically

ALTER TABLE discordsh.dungeon_profiles
    ADD CONSTRAINT dungeon_profiles_active_mode_check
    CHECK (active_mode IS NULL OR active_mode IN ('discord', 'isometric', 'bbs'));
```

plus a `CREATE OR REPLACE` of `service_claim_mode` whose body is byte-identical to `20260409210000` except the `IN` list and the error string.

The constraint was added inline by `ADD COLUMN ... CHECK`, so Postgres named it. Resolve the name from `pg_constraint` rather than guessing it.

### Verifying it, without side effects

Assert against the **function**, not the constraint. The mode guard runs before the `session_id` check, the advisory lock, and any `INSERT`, so a `NULL` session id makes a safe probe:

```sql
SELECT r.message FROM discordsh.service_claim_mode(1, 'bbs', NULL) r;
-- widened  -> 'session_id is required.'
-- not      -> 'Invalid mode (...)'
```

Do **not** probe with `discord_id = -1`: the table has `CHECK (discord_id > 0)`, and the not-found branch inserts a profile, so that probe raises.

---

## Gap 2 — existing profiles aren't linked to auth accounts

`auth_user_id` is nullable and mostly unset. Backfill it from `auth.identities`.

```sql
WITH candidate AS (
    SELECT
        p.discord_id,
        i.user_id,
        COUNT(*) OVER (PARTITION BY p.discord_id) AS matches_for_profile
    FROM discordsh.dungeon_profiles p
    JOIN auth.identities i
      ON i.provider = 'discord'
     AND i.provider_id = p.discord_id::TEXT
    WHERE p.auth_user_id IS NULL
),
eligible AS (
    SELECT c.discord_id, c.user_id
    FROM candidate c
    WHERE c.matches_for_profile = 1
      AND NOT EXISTS (
          SELECT 1 FROM discordsh.dungeon_profiles taken
          WHERE taken.auth_user_id = c.user_id
      )
)
UPDATE discordsh.dungeon_profiles p
   SET auth_user_id = e.user_id
  FROM eligible e
 WHERE p.discord_id = e.discord_id;
```

`auth_user_id` is `UNIQUE`, so both guards matter: skip snowflakes resolving to more than one auth user, and skip auth users already bound to another profile. Leaving such a row alone is correct — an arbitrary winner is not. Idempotent; a re-run fills nothing new.

---

## Gap 3 — no UUID-keyed way in

Proposed additions, all additive:

```sql
discordsh.service_resolve_auth_user(p_discord_id BIGINT)  RETURNS UUID
discordsh.service_resolve_discord_id(p_auth_user_id UUID) RETURNS BIGINT
discordsh.service_link_auth_auto(p_discord_id BIGINT)     RETURNS TABLE(linked BOOLEAN, auth_user_id UUID, message TEXT)

discordsh.service_upsert_profile_by_auth(p_auth_user_id UUID, ...)          -- same tail as service_upsert_profile
discordsh.service_claim_mode_by_auth(p_auth_user_id UUID, p_mode TEXT, p_session_id TEXT, p_force BOOLEAN DEFAULT FALSE)
discordsh.service_release_mode_by_auth(p_auth_user_id UUID, p_session_id TEXT)
```

`service_resolve_discord_id` checks `dungeon_profiles.auth_user_id` first (authoritative once set), then falls back to `auth.identities` so a player who linked after their profile was created still resolves. Guard the fallback with `provider_id ~ '^[0-9]{15,25}$'` so a malformed identity row can't raise on the `::BIGINT` cast.

`service_link_auth_auto` returns `linked=false` with a reason rather than raising, so "no KBVE account" stays an ordinary guest outcome instead of an error path.

### Trap: the `_by_auth` wrappers must delegate, not reimplement

The existing RPCs serialize per player with:

```sql
PERFORM pg_advisory_xact_lock(p_discord_id);
```

If the `_by_auth` variants locked on a UUID-derived key — say `hashtextextended(auth_user_id::text, 0)` — then a BBS caller and a Discord caller touching **the same profile** would sit in two different lock spaces and could interleave writes. The advisory lock would look present and do nothing.

So each wrapper resolves the UUID to `discord_id` and calls the existing function:

```sql
CREATE OR REPLACE FUNCTION discordsh.service_claim_mode_by_auth(
    p_auth_user_id UUID, p_mode TEXT, p_session_id TEXT, p_force BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(success BOOLEAN, current_mode TEXT, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_discord_id BIGINT;
BEGIN
    v_discord_id := discordsh.service_resolve_discord_id(p_auth_user_id);

    IF v_discord_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::TEXT,
            'No dungeon profile for this KBVE account (guest).'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT r.success, r.current_mode, r.message
      FROM discordsh.service_claim_mode(v_discord_id, p_mode, p_session_id, p_force) r;
END;
$$;
```

One lock space, one code path, no duplicated logic. `service_upsert_profile_by_auth` and `service_release_mode_by_auth` follow the same shape.

### Trap: `SECURITY DEFINER` reading `auth.*` must be owned by `postgres`

Any of these functions that touches `auth.identities` — `service_resolve_auth_user`, `service_resolve_discord_id`, `service_identity_coverage` — must end with:

```sql
ALTER FUNCTION discordsh.service_resolve_auth_user(BIGINT) OWNER TO postgres;
```

Owned by `service_role` the body throws `42501: permission denied for table identities`, because `service_role` has no `SELECT` on `auth.*` and `SECURITY DEFINER` runs as the owner. This is the same trap fixed for `tracker.find_claim_identity_by_discord_id` in `20260615130000`. Local dev hides it when `service_role` is a superuser stub.

Grants stay `service_role`-only:

```sql
REVOKE ALL ON FUNCTION discordsh.service_resolve_auth_user(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_resolve_auth_user(BIGINT) TO service_role;
```

Functions that never read `auth.*` (the `_by_auth` wrappers, `service_link_auth_auto`) can stay `OWNER TO service_role`.

---

## Gap 4 — sizing the blast radius before the PK flip

Today a Discord player persists with **no KBVE account at all**: `service_claim_mode` auto-creates a row from the snowflake alone. If persistence later requires real auth, those players silently stop saving.

Add a read-only counter so the decision is made on a number, not a guess:

```sql
CREATE OR REPLACE FUNCTION discordsh.service_identity_coverage()
RETURNS TABLE(total BIGINT, linked BIGINT, unlinked BIGINT, linkable BIGINT)
```

`linkable` = unlinked rows that a backfill re-run would now resolve. It should read 0 right after the backfill and grow as players sign in to KBVE later.

---

## The bigger open question: what does "cross-play" mean here

The mode lock is **deliberately anti-crossplay**. Its own comment: sessions are serial, a player is in one mode or the other, never both. That is right for one profile with two clients. It does **not** give you a Discord player and a telnet player adventuring in the same live party.

Two different features:

- **Same account, either door.** Works with everything above. Cheap.
- **Mixed live party.** Needs shared `SessionState` across processes. Today the whole simulation is a `DashMap<ShortSid, Arc<Mutex<SessionState>>>` in one `replicas: 1` StatefulSet, and only `DungeonProfile` is persisted — live room/enemies/turn/map die on restart. Recommended shape is moving sim authority into `axum-kbve` (which already has proto/gameserver/valkey) and making the bot a client, rather than serializing `SessionState` into Valkey.

Decide which one is wanted before writing any of this.

---

## Also unresolved: Discordless players

`discord_id` is still `BIGINT PRIMARY KEY NOT NULL`, and `dungeon_runs.discord_id` carries an `ON DELETE CASCADE` FK to it. A BBS-native player who never linked Discord therefore **cannot have a row at all**.

Options, neither taken yet:

1. Make `discord_id` nullable with `CHECK (discord_id IS NOT NULL OR auth_user_id IS NOT NULL)`.
2. Flip the PK to `auth_user_id`, demote `discord_id` to `UNIQUE NULL`, and repoint the `dungeon_runs` FK.

Option 2 is the end state if persistence becomes auth-only, but it is the one-way door. Sequence it after the backfill has run and `service_identity_coverage()` has been read, with an in-game link prompt shipped in between so the unlinked count falls on its own.

---

## Verification status

The full migration and a companion `.test.sql` were written and run against `ghcr.io/kbve/postgres:17.4.1.069-kilobase` (the image CI uses) via `packages/data/sql/dbmate/test-migration.sh`: **up → assert → rollback → assert → re-apply, passing**, plus 18 ad-hoc behaviour cases. Findings worth keeping:

- Cross-door contention behaves: with BBS holding the lock, a Discord claim on the same profile is refused with `Player is already in bbs (claim age 0.0 min).`
- Wrong-session release is refused; correct-session release succeeds.
- A guest write returns `success=false` with a message rather than raising.
- Bad input (`NULL`, negative snowflake) returns `NULL` rather than raising.

Two harness notes for whoever writes the real migration:

- `test-migration.sh` **reuses its pgdata volume** between runs. Seeds must be idempotent — delete fixture rows first. A duplicate `auth.identities` row for one snowflake makes the backfill's one-match guard skip that row and silently invalidates the assertions.
- dbmate connects as `supabase_admin`, not `postgres`.

The verified text is not committed anywhere. Regenerate it from this document, and re-run `test-migration.sh` rather than trusting the results above.
