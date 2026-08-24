-- migrate:up
SET search_path TO ows;

-- Users.UserGUID was the primary key on its own, inherited from upstream OWS where a single
-- deployment meant a single tenant. ROWS is multi-tenant (every other table keys on
-- (CustomerGUID, ...)), and every users lookup in the service is already scoped
-- `WHERE customerguid = $1 AND userguid = $2`. The global PK meant a Supabase account that had
-- logged into tenant A could never be provisioned into tenant B: the scoped SELECTs miss, the
-- INSERT ... ON CONFLICT (userguid) DO NOTHING collides on the global PK, and tenant B ends up
-- with a session but no users row. Character creation then INSERT..SELECTs zero rows and the
-- roster stays empty forever.
--
-- Re-key Users on (CustomerGUID, UserGUID). The composite is strictly weaker than the old PK, so
-- no existing row can violate it and no data migration is needed. The two dependent FKs
-- (Characters, UserSessions) already carry CustomerGUID, so they widen to the composite and gain
-- tenant integrity they did not have before.

ALTER TABLE Characters DROP CONSTRAINT IF EXISTS FK_Characters_UserGUID;
ALTER TABLE UserSessions DROP CONSTRAINT IF EXISTS FK_UserSessions_UserGUID;

ALTER TABLE Users DROP CONSTRAINT IF EXISTS PK_Users;
ALTER TABLE Users ADD CONSTRAINT PK_Users PRIMARY KEY (CustomerGUID, UserGUID);

ALTER TABLE Characters
    ADD CONSTRAINT FK_Characters_UserGUID
        FOREIGN KEY (CustomerGUID, UserGUID) REFERENCES Users (CustomerGUID, UserGUID);

ALTER TABLE UserSessions
    ADD CONSTRAINT FK_UserSessions_UserGUID
        FOREIGN KEY (CustomerGUID, UserGUID) REFERENCES Users (CustomerGUID, UserGUID);

-- The old PK also served lookups keyed on UserGUID alone (legacy re-key paths, session purges).
-- Keep a non-unique index so those stay cheap.
CREATE INDEX IF NOT EXISTS IX_Users_UserGUID ON Users (UserGUID);

-- migrate:down
SET search_path TO ows;

ALTER TABLE Characters DROP CONSTRAINT IF EXISTS FK_Characters_UserGUID;
ALTER TABLE UserSessions DROP CONSTRAINT IF EXISTS FK_UserSessions_UserGUID;

DROP INDEX IF EXISTS IX_Users_UserGUID;

-- Rolling back can fail if the same UserGUID now exists under more than one tenant, which is
-- exactly what the up-migration permits. Drop those rows or re-key them before rolling back.
ALTER TABLE Users DROP CONSTRAINT IF EXISTS PK_Users;
ALTER TABLE Users ADD CONSTRAINT PK_Users PRIMARY KEY (UserGUID);

ALTER TABLE Characters
    ADD CONSTRAINT FK_Characters_UserGUID
        FOREIGN KEY (UserGUID) REFERENCES Users (UserGUID);

ALTER TABLE UserSessions
    ADD CONSTRAINT FK_UserSessions_UserGUID
        FOREIGN KEY (UserGUID) REFERENCES Users (UserGUID);
