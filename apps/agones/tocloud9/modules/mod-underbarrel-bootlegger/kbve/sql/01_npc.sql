-- Derived from upstream data/sql/db-world/mod_bootlegger.sql (AGPL-3.0),
-- split so the NPC can exist without being placed anywhere.
--
-- Defines Fizzik only: gossip text, template, model. Spawns no creature.
-- Re-runnable.

SET @ENTRY   := 7000000;
SET @MODEL   := 7179;
SET @TEXT_ID := 7000200;

DELETE FROM `npc_text` WHERE `ID` = @TEXT_ID;
INSERT INTO `npc_text` (`ID`, `text0_0`, `lang0`, `Probability0`, `VerifiedBuild`) VALUES
(@TEXT_ID,
 'Psst — over here, friend. You didn''t hear it from me, but ol'' Fizzik can sort out just about any little... inconvenience. For the right price, ''course. Whaddya need?',
 0, 1, 0);

DELETE FROM `creature_template` WHERE `entry` = @ENTRY;
INSERT INTO `creature_template` (`entry`, `name`, `subname`, `IconName`, `minlevel`, `maxlevel`, `faction`, `npcflag`, `unit_class`, `unit_flags`, `type`, `flags_extra`, `ScriptName`) VALUES
(@ENTRY, 'Fizzik Underbarrel', 'Bootleg Services', 'Speak', 80, 80, 35, 1, 1, 2, 7, 0, 'npc_bootlegger');

DELETE FROM `creature_template_model` WHERE `CreatureID` = @ENTRY;
INSERT INTO `creature_template_model` (`CreatureID`, `Idx`, `CreatureDisplayID`, `DisplayScale`, `Probability`) VALUES
(@ENTRY, 0, @MODEL, 1, 1);
