-- migrate:up

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

-- migrate:down

ALTER TABLE profile.username_banlist
    DROP COLUMN IF EXISTS category;
