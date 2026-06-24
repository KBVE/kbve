-- migrate:up
SET search_path TO ows;

ALTER TABLE MapInstances ADD COLUMN IF NOT EXISTS GameServerName VARCHAR(253) NULL;

-- migrate:down
SET search_path TO ows;

ALTER TABLE MapInstances DROP COLUMN IF EXISTS GameServerName;
