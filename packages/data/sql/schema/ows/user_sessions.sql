-- OWS Schema: UserSessions
SET search_path TO ows;

CREATE TABLE UserSessions
(
    CustomerGUID          UUID                           NOT NULL,
    UserSessionGUID       UUID DEFAULT gen_random_uuid() NOT NULL,
    UserGUID              UUID                           NOT NULL,
    LoginDate             TIMESTAMP                      NOT NULL,
    SelectedCharacterName VARCHAR(50)                    NULL,
    CONSTRAINT PK_UserSessions
        PRIMARY KEY (CustomerGUID, UserSessionGUID),
    CONSTRAINT FK_UserSessions_UserGUID
        FOREIGN KEY (UserGUID) REFERENCES Users (UserGUID)
);

-- Security: UserSessions
ALTER TABLE UserSessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE UserSessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON UserSessions FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON UserSessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON UserSessions TO ows;
