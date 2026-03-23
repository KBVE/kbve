-- OWS Schema: ChatMessages
SET search_path TO ows;

CREATE TABLE ChatMessages
(
    CustomerGUID  UUID                    NOT NULL,
    ChatMessageID SERIAL                  NOT NULL,
    SentByCharID  INT                     NOT NULL,
    SentToCharID  INT                     NULL,
    ChatGroupID   INT                     NULL,
    ChatMessage   TEXT                    NOT NULL,
    MessageDate   TIMESTAMP DEFAULT NOW() NOT NULL,
    CONSTRAINT PK_ChatMessages
        PRIMARY KEY (CustomerGUID, ChatMessageID)
);

-- Security: ChatMessages
ALTER TABLE ChatMessages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ChatMessages FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ChatMessages FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ChatMessages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ChatMessages TO ows;
