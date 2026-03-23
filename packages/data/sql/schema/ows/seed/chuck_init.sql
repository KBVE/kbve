-- Chuck OWS Seed Data
-- Parameterized — no secrets in this file.
--
-- Usage:
--   kubectl port-forward -n kilobase svc/supabase-cluster-rw 54322:5432
--   GUID=$(kubectl get secret ows-customer-guid -n ows -o jsonpath='{.data.customer-guid}' | base64 -d)
--   PGPASSWORD=<pass> psql -h localhost -p 54322 -U ows -d supabase \
--     -v customer_guid="'${GUID}'" \
--     -v server_ip="'game.chuckrpg.com'" \
--     -f packages/data/sql/schema/ows/seed/chuck_init.sql

SET search_path TO ows;

DO $$
    DECLARE _CustomerGUID UUID;
    DECLARE _ServerIP TEXT;
    DECLARE _DefaultCharacterValuesID INT;
BEGIN

    _CustomerGUID := :'customer_guid';
    _ServerIP := :'server_ip';

    RAISE NOTICE 'Chuck seed: CustomerGUID=%, ServerIP=%', _CustomerGUID, _ServerIP;

    -- Customer record
    INSERT INTO Customers (CustomerGUID, CustomerName, CustomerEmail, EnableAutoLoopBack, NoPortForwarding)
    VALUES (_CustomerGUID, 'Chuck', 'admin@chuckrpg.com', true, true)
    ON CONFLICT (CustomerGUID) DO NOTHING;

    -- MainWorld zone
    IF NOT EXISTS (SELECT 1 FROM Maps WHERE CustomerGUID = _CustomerGUID AND ZoneName = 'MainWorld') THEN
        INSERT INTO Maps (CustomerGUID, MapName, MapData, Width, Height, ZoneName, WorldCompContainsFilter, WorldCompListFilter, MapMode, SoftPlayerCap, HardPlayerCap, MinutesToShutdownAfterEmpty)
        VALUES (_CustomerGUID, 'Lvl_ThirdPerson', NULL, 1, 1, 'MainWorld', '', '', 1, 60, 80, 1);
        RAISE NOTICE 'Created MainWorld zone';
    END IF;

    -- World server
    IF NOT EXISTS (SELECT 1 FROM WorldServers WHERE CustomerGUID = _CustomerGUID) THEN
        INSERT INTO WorldServers (CustomerGUID, ServerIP, InternalServerIP, MaxNumberOfInstances, Port, ServerStatus, StartingMapInstancePort)
        VALUES (_CustomerGUID, _ServerIP, '127.0.0.1', 10, 8181, 0, 7778);
        RAISE NOTICE 'Created world server: %', _ServerIP;
    END IF;

    -- Default character values
    IF NOT EXISTS (SELECT 1 FROM DefaultCharacterValues WHERE CustomerGUID = _CustomerGUID AND DefaultSetName = 'Default') THEN
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
    END IF;

    RAISE NOTICE '=== Chuck seed complete ===';
END $$;
