-- Chuck OWS Maintenance Queries
-- Run when WorldServer data gets corrupted (e.g. launcher restarts creating duplicates)
--
-- Usage:
--   kubectl exec -n kilobase $(kubectl get pods -n kilobase -l role=primary -o jsonpath='{.items[0].metadata.name}') -c postgres -- \
--     psql -U postgres -d supabase -f packages/data/sql/schema/ows/seed/chuck_maintenance.sql
--
-- Or via port-forward:
--   psql -h localhost -p 54322 -U ows -d supabase \
--     -v customer_guid="'83d88046-...'" \
--     -v launcher_guid="'42a499a7-...'" \
--     -f chuck_maintenance.sql

SET search_path TO ows, extensions, public;

BEGIN;

DO $$
    DECLARE _CustomerGUID UUID := :'customer_guid';
    DECLARE _LauncherGUID UUID := :'launcher_guid';
    DECLARE _Deleted INT;
    DECLARE _ActiveCount INT;
BEGIN
    RAISE NOTICE 'Chuck maintenance: CustomerGUID=%, LauncherGUID=%', _CustomerGUID, _LauncherGUID;

    -- 1. Remove duplicate WorldServer rows (keep lowest ID)
    WITH keep AS (
        SELECT MIN(WorldServerID) AS id
        FROM WorldServers
        WHERE CustomerGUID = _CustomerGUID
    )
    DELETE FROM WorldServers
    WHERE CustomerGUID = _CustomerGUID
      AND WorldServerID NOT IN (SELECT id FROM keep);

    GET DIAGNOSTICS _Deleted = ROW_COUNT;
    IF _Deleted > 0 THEN
        RAISE NOTICE 'Removed % duplicate WorldServer rows', _Deleted;
    END IF;

    -- 2. Set the remaining WorldServer to active with the stable launcher GUID
    UPDATE WorldServers
    SET ServerStatus = 1,
        ZoneServerGUID = _LauncherGUID,
        ServerIP = 'game.chuckrpg.com',
        ActiveStartTime = NOW()
    WHERE CustomerGUID = _CustomerGUID;

    -- 3. Clean up orphaned MapInstances (status != 2 and older than 1 hour)
    DELETE FROM MapInstances
    WHERE CustomerGUID = _CustomerGUID
      AND Status != 2
      AND LastUpdateFromServer < NOW() - INTERVAL '1 hour';

    GET DIAGNOSTICS _Deleted = ROW_COUNT;
    IF _Deleted > 0 THEN
        RAISE NOTICE 'Cleaned up % stale MapInstances', _Deleted;
    END IF;

    -- 4. Verify
    SELECT COUNT(*) INTO _ActiveCount
    FROM WorldServers
    WHERE CustomerGUID = _CustomerGUID AND ServerStatus = 1;

    RAISE NOTICE 'Active WorldServers: %', _ActiveCount;
    RAISE NOTICE '=== Maintenance complete ===';
END $$;

COMMIT;
