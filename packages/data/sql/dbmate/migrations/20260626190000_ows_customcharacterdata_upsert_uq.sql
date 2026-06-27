-- migrate:up

-- ROWS "Select Character" upsert was failing with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- `CharsRepo::add_or_update_custom_data` runs
--   INSERT INTO customcharacterdata (...) ON CONFLICT (customerguid, characterid, customfieldname) DO UPDATE ...
-- but CustomCharacterData only had PK (CustomerGUID, CustomCharacterDataID) — a surrogate
-- SERIAL — so no constraint matched the conflict target. Add the natural-key UNIQUE.
SET search_path TO ows;

-- Hold writers off for the gap between the dedup DELETE and ADD CONSTRAINT so a
-- concurrent insert can't slip a duplicate in. Reads still proceed.
LOCK TABLE CustomCharacterData IN SHARE ROW EXCLUSIVE MODE;

-- Collapse any pre-existing duplicates before the constraint is enforced, otherwise
-- the ADD CONSTRAINT would fail. Keeps the highest CustomCharacterDataID per key —
-- "last write wins" only because the id is a monotonic SERIAL, so the newest insert
-- always has the largest id (mirroring the upsert's intent).
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
--
-- NOTE: this only restores the surrogate-key shape by dropping the constraint. The
-- dedup DELETE above is NOT reversed — collapsed duplicate rows are gone for good
-- (last-write-wins). Rollback is for the schema object, not the data; snapshot before
-- applying if the duplicate rows matter.

SET search_path TO ows;

ALTER TABLE CustomCharacterData
    DROP CONSTRAINT IF EXISTS UQ_CustomCharacterData_Field;
