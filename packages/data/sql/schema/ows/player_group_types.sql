-- OWS Schema: PlayerGroupTypes
SET search_path TO ows;

CREATE TABLE PlayerGroupTypes
(
    PlayerGroupTypeID   INT         NOT NULL,
    PlayerGroupTypeDesc VARCHAR(50) NOT NULL,
    CONSTRAINT PK_PlayerGroupTypes
        PRIMARY KEY (PlayerGroupTypeID)
);

-- Security: PlayerGroupTypes
ALTER TABLE PlayerGroupTypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE PlayerGroupTypes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON PlayerGroupTypes FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON PlayerGroupTypes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON PlayerGroupTypes TO ows;
