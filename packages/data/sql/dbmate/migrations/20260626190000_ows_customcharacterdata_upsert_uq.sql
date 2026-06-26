-- migrate:up

-- ROWS "Select Character" upsert was failing with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- `CharsRepo::add_or_update_custom_data` runs
--   INSERT INTO customcharacterdata (...) ON CONFLICT (customerguid, characterid, customfieldname) DO UPDATE ...
-- but CustomCharacterData only had PK (CustomerGUID, CustomCharacterDataID) — a surrogate
-- SERIAL — so no constraint matched the conflict target. Add the natural-key UNIQUE.
SET search_path TO ows;

-- Collapse any pre-existing duplicates (last write wins, mirroring the upsert) before
-- the constraint is enforced, otherwise the ADD CONSTRAINT would fail.
DELETE FROM CustomCharacterData c
USING CustomCharacterData newer
WHERE c.CustomerGUID = newer.CustomerGUID
  AND c.CharacterID = newer.CharacterID
  AND c.CustomFieldName = newer.CustomFieldName
  AND c.CustomCharacterDataID < newer.CustomCharacterDataID;

ALTER TABLE CustomCharacterData
    ADD CONSTRAINT UQ_CustomCharacterData_Field
        UNIQUE (CustomerGUID, CharacterID, CustomFieldName);

-- migrate:down

SET search_path TO ows;

ALTER TABLE CustomCharacterData
    DROP CONSTRAINT IF EXISTS UQ_CustomCharacterData_Field;
