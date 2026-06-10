-- OWS Tenant Seed — generic, parameterized. NO secrets in this file.
-- Seeds one tenant (Customer + Map + DefaultCharacterValues) per invocation.
-- The customer_guid is pulled from the tenant's sealed secret at apply time, never committed.
-- Idempotent: every INSERT is guarded by WHERE NOT EXISTS, so re-runs are no-ops.
--
-- psql :'var' interpolation does NOT work inside DO/dollar-quoted blocks, so all statements
-- are top-level.
--
-- Usage (run once per tenant; example chuckrpg-dev):
--   kubectl port-forward -n kilobase svc/supabase-cluster-rw 54322:5432
--   NS=rows-chuckrpg-dev
--   GUID=$(kubectl get secret ows-customer-guid -n "$NS" -o jsonpath='{.data.customer-guid}' | base64 -d)
--   PGPASSWORD=<pass> psql -h localhost -p 54322 -U ows -d supabase \
--     -v customer_guid="${GUID}" \
--     -v customer_name="ChuckRPG Dev" \
--     -v customer_email="admin@chuckrpg.com" \
--     -v map_name="Lvl_ThirdPerson" \
--     -v zone_name="MainWorld" \
--     -f packages/data/sql/schema/ows/seed/tenants_init.sql
--
-- Pass raw values (no surrounding single quotes) — the :'var' form quotes them.

SET search_path TO ows, extensions, public;

BEGIN;

INSERT INTO Customers (CustomerGUID, CustomerName, CustomerEmail, EnableAutoLoopBack, NoPortForwarding)
SELECT :'customer_guid'::uuid, :'customer_name', :'customer_email', true, true
WHERE NOT EXISTS (SELECT 1 FROM Customers WHERE CustomerGUID = :'customer_guid'::uuid);

INSERT INTO Maps (CustomerGUID, MapName, MapData, Width, Height, ZoneName, WorldCompContainsFilter, WorldCompListFilter, MapMode, SoftPlayerCap, HardPlayerCap, MinutesToShutdownAfterEmpty)
SELECT :'customer_guid'::uuid, :'map_name', NULL, 1, 1, :'zone_name', '', '', 1, 60, 80, 1
WHERE NOT EXISTS (
    SELECT 1 FROM Maps WHERE CustomerGUID = :'customer_guid'::uuid AND MapName = :'map_name'
);

INSERT INTO DefaultCharacterValues (CustomerGUID, DefaultSetName, StartingMapName, X, Y, Z, RX, RY, RZ)
SELECT :'customer_guid'::uuid, 'Default', :'zone_name', -11, 19, 310, 0, 0, 0
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
