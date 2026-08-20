CREATE TABLE IF NOT EXISTS `mod_rent_a_mount_offers` (
    `id` INT UNSIGNED NOT NULL,
    `team` TINYINT UNSIGNED NOT NULL DEFAULT 2,
    `spell` INT UNSIGNED NOT NULL,
    `price_copper` INT UNSIGNED NOT NULL DEFAULT 0,
    `duration_seconds` INT UNSIGNED NOT NULL DEFAULT 0,
    `label` VARCHAR(100) NOT NULL,
    `min_level` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `min_riding_skill` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `enabled` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (`id`),
    KEY `idx_team_enabled` (`team`, `enabled`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

DELETE FROM `npc_text` WHERE `ID` = 90030;
INSERT INTO `npc_text` (`ID`, `text0_0`, `text0_1`, `VerifiedBuild`) VALUES
(90030, 'Need something to ride? I rent by the minute, and I do not chase down strays.', 'Need something to ride? I rent by the minute, and I do not chase down strays.', 0);
