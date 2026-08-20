DELETE FROM `creature_template` WHERE `entry` BETWEEN 900300 AND 900301;
INSERT INTO `creature_template`
(`entry`, `name`, `subname`, `minlevel`, `maxlevel`, `faction`, `npcflag`, `speed_walk`, `speed_run`,
 `unit_class`, `unit_flags`, `type`, `type_flags`, `RegenHealth`, `MovementType`, `AIName`, `ScriptName`) VALUES
(900300, 'Corwin Fastrein', 'Mount Rentals', 40, 40, 35, 1, 1, 1.14286, 1, 512, 7, 0, 1, 0, '', 'npc_rent_a_mount'),
(900301, 'Grosh the Wrangler', 'Mount Rentals', 40, 40, 35, 1, 1, 1.14286, 1, 512, 7, 0, 1, 0, '', 'npc_rent_a_mount');

DELETE FROM `creature_template_model` WHERE `CreatureID` BETWEEN 900300 AND 900301;
INSERT INTO `creature_template_model` (`CreatureID`, `Idx`, `CreatureDisplayID`, `DisplayScale`, `Probability`) VALUES
(900300, 0, 2412, 1, 1),
(900301, 0, 10182, 1, 1);

DELETE FROM `creature` WHERE `guid` BETWEEN 9003000 AND 9003003;
INSERT INTO `creature`
(`guid`, `id1`, `map`, `spawnMask`, `phaseMask`, `position_x`, `position_y`, `position_z`, `orientation`,
 `spawntimesecs`, `wander_distance`, `MovementType`, `Comment`) VALUES
(9003000, 900300, 0, 1, 1, -8735.20, 979.40, 97.60, 0.61, 300, 0, 0, 'mod-rent-a-mount Stormwind'),
(9003001, 900300, 0, 1, 1, -5007.10, -1258.30, 507.80, 3.77, 300, 0, 0, 'mod-rent-a-mount Ironforge'),
(9003002, 900301, 1, 1, 1, 2130.60, -4664.20, 46.80, 1.52, 300, 0, 0, 'mod-rent-a-mount Orgrimmar'),
(9003003, 900301, 0, 1, 1, 1634.60, 223.10, -43.02, 4.17, 300, 0, 0, 'mod-rent-a-mount Undercity');

DELETE FROM `mod_rent_a_mount_offers` WHERE `id` BETWEEN 1 AND 2;
INSERT INTO `mod_rent_a_mount_offers`
(`id`, `team`, `spell`, `price_copper`, `duration_seconds`, `label`, `min_level`, `min_riding_skill`, `enabled`) VALUES
(1, 0, 458, 50, 900, 'Rent a horse (15 minutes)', 20, 75, 1),
(2, 1, 580, 50, 900, 'Rent a wolf (15 minutes)', 20, 75, 1);
