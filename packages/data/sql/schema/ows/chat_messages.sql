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
