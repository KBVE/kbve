-- migrate:up
SET search_path TO ows;

-- Second half of the tenant-scoped Users re-key (20260824120000). That migration added
-- FK_Characters_UserGUID / FK_UserSessions_UserGUID as NOT VALID so the re-key itself could not be
-- blocked by pre-existing data. This repairs the one child table that is safe to repair
-- automatically, then validates both.
--
-- VALIDATE CONSTRAINT takes SHARE UPDATE EXCLUSIVE, not ACCESS EXCLUSIVE: concurrent reads and
-- writes to Characters / UserSessions keep working while the scan runs.
--
-- History: the first prod run of this migration aborted here with
--   pq: insert or update on table "usersessions" violates foreign key constraint
--       "fk_usersessions_userguid"
-- Characters validated clean; UserSessions carried rows whose CustomerGUID disagreed with their
-- parent's -- legal under the old UserGUID-only FK, illegal under the composite one. The whole
-- migration rolled back, leaving both constraints NOT VALID (new writes constrained, old rows
-- unchecked). ci-dbmate-validate runs against an empty database, so it cannot catch this class of
-- failure; the repair has to live in the migration, or every database with the same history hits
-- the same wall and needs the same undocumented hand-fix.

-- UserSessions is cache, not record. UsersRepo::create_session already purges a user's prior
-- session on every login (DELETE FROM usersessions WHERE userguid = $1), so a deleted row costs
-- the player one re-login and nothing else. Deleting orphans is therefore safe to automate.
--
-- Anti-join on the composite key on purpose. After 20260824120000 the same UserGUID may live in
-- several tenants, so joining on UserGUID alone and comparing CustomerGUID reports valid rows.
WITH dead AS (
    SELECT s.CustomerGUID, s.UserSessionGUID
      FROM UserSessions s
      LEFT JOIN Users u
        ON u.CustomerGUID = s.CustomerGUID AND u.UserGUID = s.UserGUID
     WHERE u.UserGUID IS NULL
),
purged AS (
    DELETE FROM UserSessions s
     USING dead
     WHERE s.CustomerGUID = dead.CustomerGUID
       AND s.UserSessionGUID = dead.UserSessionGUID
     RETURNING 1
)
SELECT count(*) AS purged_cross_tenant_sessions FROM purged;

-- Characters is player data and is NOT repaired automatically -- a row needs a decision: repoint
-- CustomerGUID at the owning tenant, or NULL out UserGUID (the column is nullable and the service
-- already tolerates ownerless legacy characters). Fail with the row count and the lookup query
-- rather than letting VALIDATE emit a bare constraint violation with no way to find the offenders.
DO $$
DECLARE
    bad_chars BIGINT;
BEGIN
    SELECT count(*) INTO bad_chars
      FROM Characters c
      LEFT JOIN Users u ON u.CustomerGUID = c.CustomerGUID AND u.UserGUID = c.UserGUID
     WHERE c.UserGUID IS NOT NULL AND u.UserGUID IS NULL;

    IF bad_chars > 0 THEN
        RAISE EXCEPTION
            'ows: % Characters rows reference a Users row in another tenant; refusing to validate FK_Characters_UserGUID. These are player data and need a per-row decision. List them with: SELECT c.CustomerGUID, c.CharacterID, c.CharName, c.UserGUID FROM ows.Characters c LEFT JOIN ows.Users u ON u.CustomerGUID = c.CustomerGUID AND u.UserGUID = c.UserGUID WHERE c.UserGUID IS NOT NULL AND u.UserGUID IS NULL;',
            bad_chars;
    END IF;
END
$$;

-- Re-running is safe: validating an already-valid constraint is a no-op, and the purge matches
-- nothing on a clean database.
ALTER TABLE Characters VALIDATE CONSTRAINT FK_Characters_UserGUID;
ALTER TABLE UserSessions VALIDATE CONSTRAINT FK_UserSessions_UserGUID;

-- migrate:down
SET search_path TO ows;

-- There is no "un-validate" in Postgres. Reversing this means dropping the constraint and
-- re-adding it NOT VALID, which is what 20260824120000's down block does wholesale. The purged
-- sessions are not restorable and do not need to be -- clients re-login. Nothing to do here; the
-- block is present so `dbmate down` walks past this version cleanly in CI.
SELECT 1;
