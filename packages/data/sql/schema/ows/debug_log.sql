-- OWS Schema: DebugLog
SET search_path TO ows;

CREATE TABLE DebugLog
(
    DebugLogID   SERIAL
        CONSTRAINT PK_DebugLogK
            PRIMARY KEY,
    DebugDate    TIMESTAMP,
    DebugDesc    TEXT,
    CustomerGUID UUID
);

-- Security: DebugLog
ALTER TABLE DebugLog ENABLE ROW LEVEL SECURITY;
ALTER TABLE DebugLog FORCE ROW LEVEL SECURITY;
REVOKE ALL ON DebugLog FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON DebugLog TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON DebugLog TO ows;
