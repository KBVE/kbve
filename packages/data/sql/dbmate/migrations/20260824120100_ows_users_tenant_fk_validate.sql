-- migrate:up
SET search_path TO ows;

-- Second half of the tenant-scoped Users re-key (20260824120000). That migration added
-- FK_Characters_UserGUID / FK_UserSessions_UserGUID as NOT VALID so the re-key itself could not be
-- blocked by pre-existing data. This validates them.
--
-- VALIDATE CONSTRAINT takes SHARE UPDATE EXCLUSIVE, not ACCESS EXCLUSIVE: concurrent reads and
-- writes to Characters / UserSessions keep working while the scan runs.
--
-- If this fails with "insert or update on table ... violates foreign key constraint", the child
-- rows point at a Users row owned by another tenant -- a state the old UserGUID-only FK allowed.
-- Find them with:
--
--   SELECT c.CustomerGUID, c.CharacterID, c.CharName, c.UserGUID
--     FROM ows.Characters c
--     LEFT JOIN ows.Users u ON u.CustomerGUID = c.CustomerGUID AND u.UserGUID = c.UserGUID
--    WHERE c.UserGUID IS NOT NULL AND u.UserGUID IS NULL;
--
--   SELECT s.CustomerGUID, s.UserSessionGUID, s.UserGUID
--     FROM ows.UserSessions s
--     LEFT JOIN ows.Users u ON u.CustomerGUID = s.CustomerGUID AND u.UserGUID = s.UserGUID
--    WHERE u.UserGUID IS NULL;
--
-- (Anti-join on the composite key on purpose. After 20260824120000 the same UserGUID may live in
-- several tenants, so joining on UserGUID alone and comparing CustomerGUID reports valid rows.)
--
-- Stale UserSessions rows are safe to DELETE (clients re-login). Characters rows need a decision
-- per row: repoint CustomerGUID at the owning tenant, or NULL out UserGUID (the column is
-- nullable and the service already tolerates ownerless legacy characters). Repair, then re-run.
-- Re-running is safe: validating an already-valid constraint is a no-op.

ALTER TABLE Characters VALIDATE CONSTRAINT FK_Characters_UserGUID;
ALTER TABLE UserSessions VALIDATE CONSTRAINT FK_UserSessions_UserGUID;

-- migrate:down
SET search_path TO ows;

-- There is no "un-validate" in Postgres. Reversing this means dropping the constraint and
-- re-adding it NOT VALID, which is what 20260824120000's down block does wholesale. Nothing to do
-- here; the block is present so `dbmate down` walks past this version cleanly in CI.
SELECT 1;
