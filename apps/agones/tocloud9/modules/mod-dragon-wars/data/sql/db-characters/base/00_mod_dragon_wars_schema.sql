CREATE TABLE IF NOT EXISTS `mod_dragon_wars_sorties` (
    `sortie_id` BIGINT UNSIGNED NOT NULL,
    `leader_guid` INT UNSIGNED NOT NULL,
    `pilot_guid` INT UNSIGNED NOT NULL,
    `plane_guid` INT UNSIGNED NOT NULL,
    `plane_entry` INT UNSIGNED NOT NULL,
    `started_at` BIGINT UNSIGNED NOT NULL,
    `expires_at` BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (`sortie_id`, `pilot_guid`),
    KEY `idx_leader` (`leader_guid`),
    KEY `idx_started` (`started_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
