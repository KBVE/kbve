-- migrate:up
SET search_path TO ows;

-- Admission gate: per-scope `accept new joins` switch. Two scopes share one table:
--   * the global sentinel row (CustomerGUID = all-zeros) freezes new joins game-wide (every tenant);
--   * a per-tenant row (CustomerGUID = that tenant) freezes new joins for that ROWS only.
-- AcceptNewJoins is NULLable: NULL (or absent row) means "fall back to the rows env baseline"
-- (ROWS_ACCEPT_NEW_JOINS, default true). ROWS reads this on the join path and blocks a *new* join
-- when either the tenant row or the global sentinel is false; travel (a player already on an
-- instance) bypasses the gate. Inert when empty — no row, no effect.
CREATE TABLE IF NOT EXISTS admission_control
(
    CustomerGUID    UUID    NOT NULL,
    AcceptNewJoins  BOOLEAN NULL,
    CONSTRAINT PK_AdmissionControl PRIMARY KEY (CustomerGUID)
);

-- Security: mirror the ows-table pattern — block anon/authenticated/public, full access for the
-- ows + service_role roles (tenant isolation is enforced app-side via WHERE customerguid).
ALTER TABLE admission_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_control FORCE ROW LEVEL SECURITY;
REVOKE ALL ON admission_control FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON admission_control TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON admission_control TO ows;
CREATE POLICY ows_access ON admission_control FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON admission_control FOR ALL TO service_role USING (true) WITH CHECK (true);

-- migrate:down
-- WARNING (F4): this DROP destroys any active operator freeze (incl. the global sentinel row).
-- Rollbacks are code-only (revert the ROWS image via Argo); run this down-migration only deliberately,
-- never as part of an incident rollback, and never against pre-Phase-1 code (would 500 every join).
SET search_path TO ows;
DROP TABLE IF EXISTS admission_control;
