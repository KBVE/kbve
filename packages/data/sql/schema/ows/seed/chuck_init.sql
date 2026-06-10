-- Chuck OWS Seed Data
-- Parameterized — no secrets in this file.
-- Idempotent: every INSERT is guarded by WHERE NOT EXISTS, so re-runs are no-ops.
--
-- psql :'var' interpolation does NOT work inside DO/dollar-quoted blocks, so all statements
-- are top-level. Pass raw values (no surrounding single quotes) — the :'var' form quotes them.
--
-- Usage:
--   kubectl port-forward -n kilobase svc/supabase-cluster-rw 54322:5432
--   GUID=$(kubectl get secret ows-customer-guid -n ows -o jsonpath='{.data.customer-guid}' | base64 -d)
--   LAUNCHER_GUID="42a499a7-77b1-493a-9f7c-d9784740e228"
--   PGPASSWORD=<pass> psql -h localhost -p 54322 -U ows -d supabase \
--     -v customer_guid="${GUID}" \
--     -v server_ip="game.chuckrpg.com" \
--     -v launcher_guid="${LAUNCHER_GUID}" \
--     -f packages/data/sql/schema/ows/seed/chuck_init.sql

SET search_path TO ows, extensions, public;

BEGIN;

INSERT INTO Customers (CustomerGUID, CustomerName, CustomerEmail, EnableAutoLoopBack, NoPortForwarding)
SELECT :'customer_guid'::uuid, 'Chuck', 'admin@chuckrpg.com', true, true
WHERE NOT EXISTS (SELECT 1 FROM Customers WHERE CustomerGUID = :'customer_guid'::uuid);

INSERT INTO Maps (CustomerGUID, MapName, MapData, Width, Height, ZoneName, WorldCompContainsFilter, WorldCompListFilter, MapMode, SoftPlayerCap, HardPlayerCap, MinutesToShutdownAfterEmpty)
SELECT :'customer_guid'::uuid, 'Lvl_ThirdPerson', NULL, 1, 1, 'MainWorld', '', '', 1, 60, 80, 1
WHERE NOT EXISTS (
    SELECT 1 FROM Maps WHERE CustomerGUID = :'customer_guid'::uuid AND MapName = 'Lvl_ThirdPerson'
);

INSERT INTO WorldServers (CustomerGUID, ServerIP, InternalServerIP, MaxNumberOfInstances, Port, ServerStatus, StartingMapInstancePort, ZoneServerGUID)
SELECT :'customer_guid'::uuid, :'server_ip', '127.0.0.1', 10, 8181, 1, 7778, :'launcher_guid'::uuid
WHERE NOT EXISTS (
    SELECT 1 FROM WorldServers WHERE CustomerGUID = :'customer_guid'::uuid AND ZoneServerGUID = :'launcher_guid'::uuid
);

INSERT INTO DefaultCharacterValues (CustomerGUID, DefaultSetName, StartingMapName, X, Y, Z, RX, RY, RZ)
SELECT :'customer_guid'::uuid, 'Default', 'MainWorld', -11, 19, 310, 0, 0, 0
WHERE NOT EXISTS (
    SELECT 1 FROM DefaultCharacterValues WHERE CustomerGUID = :'customer_guid'::uuid AND DefaultSetName = 'Default'
);

INSERT INTO DefaultCustomCharacterData (CustomerGUID, DefaultCharacterValuesID, CustomFieldName, FieldValue)
SELECT :'customer_guid'::uuid, dcv.DefaultCharacterValuesID, f.field_name, f.field_value
FROM DefaultCharacterValues dcv
CROSS JOIN (VALUES
    ('SkillTrees',        '{"active": [], "saved": {}}'),
    ('Professions',       '{"major": [], "minor": {}}'),
    ('ActionBars',        '{"bars": []}'),
    ('BagInventory',      '{"items": []}'),
    ('BaseCharacterStats','{"Strength": 10, "Agility": 10, "Constitution": 10, "Intellect": 10, "Wisdom": 10, "Charisma": 10}')
) AS f(field_name, field_value)
WHERE dcv.CustomerGUID = :'customer_guid'::uuid
  AND dcv.DefaultSetName = 'Default'
  AND NOT EXISTS (
      SELECT 1 FROM DefaultCustomCharacterData d
      WHERE d.CustomerGUID = :'customer_guid'::uuid AND d.CustomFieldName = f.field_name
  );

COMMIT;
