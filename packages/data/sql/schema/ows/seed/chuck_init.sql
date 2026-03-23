-- Chuck OWS Seed Data
-- Parameterized — no secrets in this file.
-- Wrapped in a transaction — all-or-nothing. Aborts if customer already exists.
--
-- Usage:
--   kubectl port-forward -n kilobase svc/supabase-cluster-rw 54322:5432
--   GUID=$(kubectl get secret ows-customer-guid -n ows -o jsonpath='{.data.customer-guid}' | base64 -d)
--   LAUNCHER_GUID="42a499a7-77b1-493a-9f7c-d9784740e228"
--   PGPASSWORD=<pass> psql -h localhost -p 54322 -U ows -d supabase \
--     -v customer_guid="'${GUID}'" \
--     -v server_ip="'game.chuckrpg.com'" \
--     -v launcher_guid="'${LAUNCHER_GUID}'" \
--     -f packages/data/sql/schema/ows/seed/chuck_init.sql

SET search_path TO ows, extensions, public;

BEGIN;

DO $$
    DECLARE _CustomerGUID UUID;
    DECLARE _ServerIP TEXT;
    DECLARE _LauncherGUID UUID;
    DECLARE _DefaultCharacterValuesID INT;
    DECLARE _Existing INT;
BEGIN

    _CustomerGUID := :'customer_guid';
    _ServerIP := :'server_ip';
    _LauncherGUID := :'launcher_guid';

    -- Guard: abort if customer already seeded
    SELECT COUNT(*) INTO _Existing FROM Customers WHERE CustomerGUID = _CustomerGUID;
    IF _Existing > 0 THEN
        RAISE NOTICE 'Customer % already exists — skipping seed.', _CustomerGUID;
        RETURN;
    END IF;

    RAISE NOTICE 'Chuck seed: CustomerGUID=%, ServerIP=%', _CustomerGUID, _ServerIP;

    -- Customer record
    INSERT INTO Customers (CustomerGUID, CustomerName, CustomerEmail, EnableAutoLoopBack, NoPortForwarding)
    VALUES (_CustomerGUID, 'Chuck', 'admin@chuckrpg.com', true, true);

    -- MainWorld zone
    INSERT INTO Maps (CustomerGUID, MapName, MapData, Width, Height, ZoneName, WorldCompContainsFilter, WorldCompListFilter, MapMode, SoftPlayerCap, HardPlayerCap, MinutesToShutdownAfterEmpty)
    VALUES (_CustomerGUID, 'Lvl_ThirdPerson', NULL, 1, 1, 'MainWorld', '', '', 1, 60, 80, 1);
    RAISE NOTICE 'Created MainWorld zone';

    -- World server (active, with stable launcher GUID for upsert)
    INSERT INTO WorldServers (CustomerGUID, ServerIP, InternalServerIP, MaxNumberOfInstances, Port, ServerStatus, StartingMapInstancePort, ZoneServerGUID)
    VALUES (_CustomerGUID, _ServerIP, '127.0.0.1', 10, 8181, 1, 7778, _LauncherGUID);
    RAISE NOTICE 'Created world server: % (active, launcher=%)', _ServerIP, _LauncherGUID;

    -- Default character values
    INSERT INTO DefaultCharacterValues (CustomerGUID, DefaultSetName, StartingMapName, X, Y, Z, RX, RY, RZ)
    VALUES (_CustomerGUID, 'Default', 'MainWorld', -11, 19, 310, 0, 0, 0);

    _DefaultCharacterValuesID := CURRVAL(PG_GET_SERIAL_SEQUENCE('defaultcharactervalues', 'defaultcharactervaluesid'));

    INSERT INTO DefaultCustomCharacterData (CustomerGUID, DefaultCharacterValuesID, CustomFieldName, FieldValue) VALUES
        (_CustomerGUID, _DefaultCharacterValuesID, 'SkillTrees', '{"active": [], "saved": {}}'),
        (_CustomerGUID, _DefaultCharacterValuesID, 'Professions', '{"major": [], "minor": {}}'),
        (_CustomerGUID, _DefaultCharacterValuesID, 'ActionBars', '{"bars": []}'),
        (_CustomerGUID, _DefaultCharacterValuesID, 'BagInventory', '{"items": []}'),
        (_CustomerGUID, _DefaultCharacterValuesID, 'BaseCharacterStats', '{"Strength": 10, "Agility": 10, "Constitution": 10, "Intellect": 10, "Wisdom": 10, "Charisma": 10}');

    RAISE NOTICE 'Created default character values with ID: %', _DefaultCharacterValuesID;
    RAISE NOTICE '=== Chuck seed complete ===';
END $$;

COMMIT;
