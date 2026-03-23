-- OWS Schema: WorldSettings
SET search_path TO ows;

CREATE TABLE WorldSettings
(
    CustomerGUID    UUID   NOT NULL,
    WorldSettingsID SERIAL NOT NULL,
    StartTime       BIGINT NOT NULL,
    CONSTRAINT PK_WorldSettings
        PRIMARY KEY (CustomerGUID, WorldSettingsID)
);
