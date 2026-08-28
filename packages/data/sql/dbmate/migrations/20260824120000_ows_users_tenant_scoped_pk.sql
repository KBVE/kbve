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
--
-- The FKs go on NOT VALID here and are validated in 20260824120100. The old FK constrained
-- UserGUID only and never checked CustomerGUID, so a child row whose CustomerGUID disagrees with
-- its parent's is possible in existing data. Adding the composite FK pre-validated would take
-- ACCESS EXCLUSIVE on Characters and UserSessions for a full scan and would abort the whole
-- deploy on the first bad row -- with the service already rolled forward. NOT VALID takes a brief
-- lock, constrains all new writes immediately, and moves the scan into its own migration where a
-- failure is diagnosable and re-runnable.

ALTER TABLE Characters DROP CONSTRAINT IF EXISTS FK_Characters_UserGUID;
ALTER TABLE UserSessions DROP CONSTRAINT IF EXISTS FK_UserSessions_UserGUID;

ALTER TABLE Users DROP CONSTRAINT IF EXISTS PK_Users;
ALTER TABLE Users ADD CONSTRAINT PK_Users PRIMARY KEY (CustomerGUID, UserGUID);

ALTER TABLE Characters
    ADD CONSTRAINT FK_Characters_UserGUID
        FOREIGN KEY (CustomerGUID, UserGUID) REFERENCES Users (CustomerGUID, UserGUID)
        NOT VALID;

ALTER TABLE UserSessions
    ADD CONSTRAINT FK_UserSessions_UserGUID
        FOREIGN KEY (CustomerGUID, UserGUID) REFERENCES Users (CustomerGUID, UserGUID)
        NOT VALID;

-- The old PK also served lookups keyed on UserGUID alone (legacy re-key paths, session purges).
-- Keep a non-unique index so those stay cheap. NOTE: non-unique -- after this migration a UserGUID
-- identifies a row only together with its CustomerGUID. Any query keyed on UserGUID alone is a
-- cross-tenant query and is almost certainly a bug.
CREATE INDEX IF NOT EXISTS IX_Users_UserGUID ON Users (UserGUID);

-- Referencing side of the two composite FKs. Without these, every parent-key change on Users --
-- which the legacy Supabase re-key path in UsersRepo::find_or_create_supabase_user performs --
-- seq-scans both child tables for the NO ACTION check. They also serve the tenant-scoped roster
-- and session lookups directly.
CREATE INDEX IF NOT EXISTS IX_Characters_Customer_User ON Characters (CustomerGUID, UserGUID);
CREATE INDEX IF NOT EXISTS IX_UserSessions_Customer_User ON UserSessions (CustomerGUID, UserGUID);

-- Surface pre-existing cross-tenant child rows now, at re-key time, rather than letting the
-- operator discover them when 20260824120100 refuses to validate.
DO $$
DECLARE
    bad_chars    BIGINT;
    bad_sessions BIGINT;
BEGIN
    -- Anti-join on the composite key, not a join on UserGUID alone: once the same UserGUID may
    -- exist in several tenants, a UserGUID-only join fans out and reports valid rows.
    SELECT count(*) INTO bad_chars
      FROM Characters c
      LEFT JOIN Users u ON u.CustomerGUID = c.CustomerGUID AND u.UserGUID = c.UserGUID
     WHERE c.UserGUID IS NOT NULL AND u.UserGUID IS NULL;

    SELECT count(*) INTO bad_sessions
      FROM UserSessions s
      LEFT JOIN Users u ON u.CustomerGUID = s.CustomerGUID AND u.UserGUID = s.UserGUID
     WHERE u.UserGUID IS NULL;

    IF bad_chars > 0 OR bad_sessions > 0 THEN
        RAISE WARNING
            'ows: % Characters and % UserSessions rows reference a Users row in another tenant. Migration 20260824120100 will refuse to validate FK_Characters_UserGUID / FK_UserSessions_UserGUID until these are repaired or deleted.',
            bad_chars, bad_sessions;
    ELSE
        RAISE NOTICE 'ows: no cross-tenant Characters/UserSessions rows; FK validation should pass.';
    END IF;
END
$$;

-- migrate:down
SET search_path TO ows;

ALTER TABLE Characters DROP CONSTRAINT IF EXISTS FK_Characters_UserGUID;
ALTER TABLE UserSessions DROP CONSTRAINT IF EXISTS FK_UserSessions_UserGUID;

DROP INDEX IF EXISTS IX_Characters_Customer_User;
DROP INDEX IF EXISTS IX_UserSessions_Customer_User;
DROP INDEX IF EXISTS IX_Users_UserGUID;

-- NOTE: this down block exists for ci-dbmate-validate only. The production runner
-- (apps/kube/kilobase/templates/dbmate-runner-job.yaml) is hardcoded to `dbmate up` and never
-- runs `down` -- to reverse this in prod you write a new forward migration. It also cannot
-- succeed once the same UserGUID exists under more than one tenant, which is exactly what the
-- up-migration permits. Drop or re-key those rows first.
ALTER TABLE Users DROP CONSTRAINT IF EXISTS PK_Users;
ALTER TABLE Users ADD CONSTRAINT PK_Users PRIMARY KEY (UserGUID);

ALTER TABLE Characters
    ADD CONSTRAINT FK_Characters_UserGUID
        FOREIGN KEY (UserGUID) REFERENCES Users (UserGUID);

ALTER TABLE UserSessions
    ADD CONSTRAINT FK_UserSessions_UserGUID
        FOREIGN KEY (UserGUID) REFERENCES Users (UserGUID);
