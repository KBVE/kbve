-- OWS Schema: GlobalData
SET search_path TO ows;

CREATE TABLE GlobalData
(
    CustomerGUID    UUID        NOT NULL,
    GlobalDataKey   VARCHAR(50) NOT NULL,
    GlobalDataValue TEXT        NOT NULL,
    CONSTRAINT PK_GlobalData
        PRIMARY KEY (CustomerGUID, GlobalDataKey)
);

-- Security: GlobalData
ALTER TABLE GlobalData ENABLE ROW LEVEL SECURITY;
ALTER TABLE GlobalData FORCE ROW LEVEL SECURITY;
REVOKE ALL ON GlobalData FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON GlobalData TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON GlobalData TO ows;
