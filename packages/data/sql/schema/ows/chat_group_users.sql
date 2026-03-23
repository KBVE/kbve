-- OWS Schema: ChatGroupUsers
SET search_path TO ows;

CREATE TABLE ChatGroupUsers
(
    CustomerGUID UUID NOT NULL,
    ChatGroupID  INT  NOT NULL,
    CharacterID  INT  NOT NULL,
    CONSTRAINT PK_ChatGroupUsers
        PRIMARY KEY (CustomerGUID, ChatGroupID, CharacterID)
);

-- Security: ChatGroupUsers
ALTER TABLE ChatGroupUsers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ChatGroupUsers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ChatGroupUsers FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ChatGroupUsers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ChatGroupUsers TO ows;
