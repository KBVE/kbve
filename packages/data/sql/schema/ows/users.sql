-- OWS Schema: Users
SET search_path TO ows;

CREATE TABLE Users
(
    UserGUID     UUID      DEFAULT gen_random_uuid() NOT NULL
        CONSTRAINT PK_Users
            PRIMARY KEY,
    CustomerGUID UUID                                NOT NULL,
    FirstName    VARCHAR(50)                         NOT NULL,
    LastName     VARCHAR(50)                         NOT NULL,
    Email        VARCHAR(255)                        NOT NULL,
    PasswordHash VARCHAR(128)                        NOT NULL,
    CreateDate   TIMESTAMP DEFAULT NOW()             NOT NULL,
    LastAccess   TIMESTAMP DEFAULT NOW()             NOT NULL,
    Role         VARCHAR(10)                         NOT NULL,
    CONSTRAINT AK_User
        UNIQUE (CustomerGUID, Email, Role)
);
