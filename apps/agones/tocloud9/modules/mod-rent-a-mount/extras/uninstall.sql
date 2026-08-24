-- mod-rent-a-mount uninstall (world database: acore_world)
--
-- Stop the worldserver before running this. Run extras/uninstall_characters.sql
-- first, while this database still holds the spell IDs it needs.
--
-- Every statement below is scoped to an ID range this module owns and no stock
-- AzerothCore row falls inside it, so this touches nothing the module did not
-- create.

DELETE FROM `creature_addon`     WHERE `guid`       BETWEEN 9003000 AND 9003003;
DELETE FROM `game_event_creature` WHERE `guid`      BETWEEN 9003000 AND 9003003;
DELETE FROM `creature`           WHERE `guid`       BETWEEN 9003000 AND 9003003;

DELETE FROM `creature_template_model` WHERE `CreatureID` BETWEEN 900300 AND 900301;
DELETE FROM `creature_template`       WHERE `entry`      BETWEEN 900300 AND 900301;

DELETE FROM `npc_text` WHERE `ID` = 90030;

DROP TABLE IF EXISTS `mod_rent_a_mount_offers`;

-- 27838 is a stock AzerothCore creature, unlike everything above. These four
-- statements return it to its shipped state: scenery, not a vehicle.
UPDATE `creature_template` SET `VehicleId` = 0, `npcflag` = 0, `faction` = 614,
       `speed_run` = 1.14286, `AIName` = '' WHERE `entry` = 27838;
DELETE FROM `creature_template_movement` WHERE `CreatureId` = 27838;
DELETE FROM `npc_spellclick_spells`      WHERE `npc_entry` = 27838;
DELETE FROM `creature_template_spell`    WHERE `CreatureID` = 27838;
DELETE FROM `smart_scripts` WHERE `entryorguid` = 27838 AND `source_type` = 0;
