-- OWS Schema: AdmissionControl
-- Per-scope new-join admission gate. The all-zeros sentinel row freezes new joins game-wide; a
-- per-tenant row freezes new joins for that tenant's ROWS. AcceptNewJoins is NULLable (NULL =
-- fall back to the rows env baseline ROWS_ACCEPT_NEW_JOINS, default true). ROWS blocks a *new* join
-- when either scope is false; travel (player already on an instance) bypasses the gate. Inert when
-- empty.
SET search_path TO ows;

CREATE TABLE AdmissionControl
(
    CustomerGUID    UUID    NOT NULL,
    AcceptNewJoins  BOOLEAN NULL,
    CONSTRAINT PK_AdmissionControl
        PRIMARY KEY (CustomerGUID)
);

-- Security: AdmissionControl
ALTER TABLE AdmissionControl ENABLE ROW LEVEL SECURITY;
ALTER TABLE AdmissionControl FORCE ROW LEVEL SECURITY;
REVOKE ALL ON AdmissionControl FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON AdmissionControl TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON AdmissionControl TO ows;
CREATE POLICY ows_access ON AdmissionControl FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON AdmissionControl FOR ALL TO service_role USING (true) WITH CHECK (true);
