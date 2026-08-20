-- mod-bootlegger uninstall — removes creature spawns, template, and gossip text.
-- IDs match reserved 7M band in mod_bootlegger.sql (7000000 / 7000100 / 7000200).

SET @ENTRY   := 7000000;
SET @GUID    := 7000100;
SET @TEXT_ID := 7000200;

DELETE FROM `creature` WHERE `guid` BETWEEN @GUID AND @GUID + 9;
DELETE FROM `creature_template_model` WHERE `CreatureID` = @ENTRY;
DELETE FROM `creature_template` WHERE `entry` = @ENTRY;
DELETE FROM `npc_text` WHERE `ID` = @TEXT_ID;
