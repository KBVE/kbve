-- migrate:up

-- profile.* tables are provisioned from the schema files, not from dbmate, so
-- the bare prod-replica CI database has no profile.username_banlist. Guard the
-- DDL on the table's existence: apply the column + backfill on real databases,
-- no-op on the schema-less migration runner.
DO $$
BEGIN
    IF to_regclass('profile.username_banlist') IS NOT NULL THEN
        ALTER TABLE profile.username_banlist
            ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'reserved';

        COMMENT ON COLUMN profile.username_banlist.category IS
            'Why the pattern is banned: profanity/slur apply to chat too; reserved is username-only.';

        UPDATE profile.username_banlist
            SET category = 'profanity'
            WHERE pattern IN ('fuck', 'shit', 'bitch', 'cunt');

        UPDATE profile.username_banlist
            SET category = 'slur'
            WHERE pattern IN ('nigg');
    END IF;
END $$;

-- migrate:down

DO $$
BEGIN
    IF to_regclass('profile.username_banlist') IS NOT NULL THEN
        ALTER TABLE profile.username_banlist
            DROP COLUMN IF EXISTS category;
    END IF;
END $$;
