-- OWS Schema: Users
SET search_path TO ows;

CREATE TABLE Users
(
    UserGUID     UUID      DEFAULT gen_random_uuid() NOT NULL,
    CustomerGUID UUID                                NOT NULL,
    FirstName    VARCHAR(50)                         NOT NULL,
    LastName     VARCHAR(50)                         NOT NULL,
    Email        VARCHAR(255)                        NOT NULL,
    PasswordHash VARCHAR(128)                        NOT NULL,
    CreateDate   TIMESTAMP DEFAULT NOW()             NOT NULL,
    LastAccess   TIMESTAMP DEFAULT NOW()             NOT NULL,
    Role         VARCHAR(10)                         NOT NULL,
    -- Tenant-scoped: the same Supabase account must be provisionable into every tenant.
    CONSTRAINT PK_Users
        PRIMARY KEY (CustomerGUID, UserGUID),
    CONSTRAINT AK_User
        UNIQUE (CustomerGUID, Email, Role)
);

CREATE INDEX IF NOT EXISTS IX_Users_UserGUID ON Users (UserGUID);

-- Security: Users
ALTER TABLE Users ENABLE ROW LEVEL SECURITY;
ALTER TABLE Users FORCE ROW LEVEL SECURITY;
REVOKE ALL ON Users FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON Users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON Users TO ows;
