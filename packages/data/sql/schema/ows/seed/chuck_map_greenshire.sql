-- OWS Maintenance — rename the stale ChuckRPG map seeded before kbve#12189.
--
-- Tenants seeded before the overlay switched MAP_NAME to `greenshire` still carry a
-- `Lvl_ThirdPerson` row in ows.Maps. The tenant seed Job is INSERT-only (WHERE NOT EXISTS
-- keyed on CustomerGUID + MapName), so re-running it does NOT fix the old row — it would
-- INSERT a second `greenshire` row alongside the stale one. This one-time fix corrects it.
--
-- Idempotent + safe to re-run:
--   * if only the old `Lvl_ThirdPerson` row exists  -> rename it to `greenshire`
--   * if a `greenshire` row already exists (e.g. a prior seed re-run) -> drop the stale row
--   * if neither / already fixed                    -> no-op
--
-- Usage (run once per affected tenant; example chuckrpg-dev):
--   kubectl port-forward -n kilobase svc/supabase-cluster-rw 54322:5432
--   NS=rows-chuckrpg-dev
--   GUID=$(kubectl get secret rows-customer-guid -n "$NS" -o jsonpath='{.data.customer-guid}' | base64 -d)
--   PGPASSWORD=<pass> psql -h localhost -p 54322 -U ows -d supabase \
--     -v ON_ERROR_STOP=1 \
--     -v customer_guid="${GUID}" \
--     -f packages/data/sql/schema/ows/seed/chuck_map_greenshire.sql
--
-- Pass the raw GUID (no surrounding single quotes) — the :'var' form quotes it.

SET search_path TO ows, extensions, public;

BEGIN;

-- Drop the stale row only when the corrected row already exists (avoids a duplicate).
DELETE FROM Maps
WHERE CustomerGUID = :'customer_guid'::uuid
  AND MapName = 'Lvl_ThirdPerson'
  AND EXISTS (
      SELECT 1 FROM Maps
      WHERE CustomerGUID = :'customer_guid'::uuid AND MapName = 'greenshire'
  );

-- Otherwise rename the stale row in place.
UPDATE Maps
SET MapName = 'greenshire'
WHERE CustomerGUID = :'customer_guid'::uuid
  AND MapName = 'Lvl_ThirdPerson';

COMMIT;
