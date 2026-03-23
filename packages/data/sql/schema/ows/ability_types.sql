-- OWS Schema: AbilityTypes
SET search_path TO ows;

CREATE TABLE AbilityTypes
(
    AbilityTypeID   SERIAL,
    AbilityTypeName VARCHAR(50) NOT NULL,
    CustomerGUID    UUID        NOT NULL,
    CONSTRAINT PK_AbilityTypes
        PRIMARY KEY (AbilityTypeID, CustomerGUID)
);

-- Security: AbilityTypes
ALTER TABLE AbilityTypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE AbilityTypes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON AbilityTypes FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON AbilityTypes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON AbilityTypes TO ows;
