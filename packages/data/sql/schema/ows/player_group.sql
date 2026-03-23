-- OWS Schema: PlayerGroup
SET search_path TO ows;

CREATE TABLE PlayerGroup
(
    PlayerGroupID     SERIAL        NOT NULL,
    CustomerGUID      UUID          NOT NULL,
    PlayerGroupName   VARCHAR(50)   NOT NULL,
    PlayerGroupTypeID INT           NOT NULL,
    ReadyState        INT DEFAULT 0 NOT NULL,
    CreateDate        TIMESTAMP     NULL,
    CONSTRAINT PK_PlayerGroup
        PRIMARY KEY (CustomerGUID, PlayerGroupID),
    CONSTRAINT FK_PlayerGroup_PlayerGroupType
        FOREIGN KEY (PlayerGroupTypeID) REFERENCES PlayerGroupTypes (PlayerGroupTypeID)
);

-- Security: PlayerGroup
ALTER TABLE PlayerGroup ENABLE ROW LEVEL SECURITY;
ALTER TABLE PlayerGroup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON PlayerGroup FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON PlayerGroup TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON PlayerGroup TO ows;
