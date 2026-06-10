-- Chuck OWS Maintenance Queries
-- Run when WorldServer data gets corrupted (e.g. launcher restarts creating duplicates).
--
-- psql :'var' interpolation does NOT work inside DO/dollar-quoted blocks, so all statements
-- are top-level. Pass raw values (no surrounding single quotes) — the :'var' form quotes them.
--
-- Usage (port-forward):
--   psql -h localhost -p 54322 -U ows -d supabase \
--     -v customer_guid="${GUID}" \
--     -v launcher_guid="${LAUNCHER_GUID}" \
--     -f packages/data/sql/schema/ows/seed/chuck_maintenance.sql

SET search_path TO ows, extensions, public;

BEGIN;

-- 1. Remove duplicate WorldServer rows (keep lowest ID).
DELETE FROM WorldServers
WHERE CustomerGUID = :'customer_guid'::uuid
  AND WorldServerID NOT IN (
      SELECT MIN(WorldServerID) FROM WorldServers WHERE CustomerGUID = :'customer_guid'::uuid
  );

-- 2. Set the remaining WorldServer active with the stable launcher GUID.
UPDATE WorldServers
SET ServerStatus = 1,
    ZoneServerGUID = :'launcher_guid'::uuid,
    ServerIP = 'game.chuckrpg.com',
    ActiveStartTime = NOW()
WHERE CustomerGUID = :'customer_guid'::uuid;

-- 3. Clean up orphaned MapInstances (status != 2 and older than 1 hour).
DELETE FROM MapInstances
WHERE CustomerGUID = :'customer_guid'::uuid
  AND Status != 2
  AND LastUpdateFromServer < NOW() - INTERVAL '1 hour';

-- 4. Verify — count of active world servers for this customer.
SELECT COUNT(*) AS active_world_servers
FROM WorldServers
WHERE CustomerGUID = :'customer_guid'::uuid AND ServerStatus = 1;

COMMIT;
