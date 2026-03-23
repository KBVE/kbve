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
