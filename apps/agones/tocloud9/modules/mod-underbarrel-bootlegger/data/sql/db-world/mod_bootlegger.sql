-- mod-bootlegger: Fizzik Underbarrel — idempotent install (10 capital spawns).
--
-- Reserved 7M band (2026-07-14; moved from 3460k to clear headroom for mod-uac):
--   @ENTRY    7000000  — creature_template (mod-bootlegger block 7000000–7000099)
--   @TEXT_ID  7000200  — npc_text (7000200–7000299)
--   @GUID     7000100  — creature spawns 7000100–7000109 (10 capitals)
--   @MODEL    7179     — creature_template_model WHERE CreatureID=2685 ORDER BY Idx LIMIT 1

SET @ENTRY   := 7000000;
SET @MODEL   := 7179;
SET @GUID    := 7000100;
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

DELETE FROM `creature` WHERE `guid` BETWEEN @GUID AND @GUID + 9;
INSERT INTO `creature` (`guid`, `id`, `map`, `zoneId`, `areaId`, `spawnMask`, `phaseMask`, `equipment_id`, `position_x`, `position_y`, `position_z`, `orientation`, `spawntimesecs`, `wander_distance`, `currentwaypoint`, `curhealth`, `curmana`, `MovementType`, `npcflag`, `unit_flags`, `dynamicflags`, `ScriptName`, `Comment`, `VerifiedBuild`) VALUES
(@GUID + 0, @ENTRY, 0,   0, 0, 1, 1, 0, -8876.078,  631.95886,  96.09245,  0.7386191, 120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'mod-bootlegger Stormwind (placeholder — owner to .gps before commit)', 0),
(@GUID + 1, @ENTRY, 0,   0, 0, 1, 1, 0, -4888.706,  -962.2678,  501.45255,  1.622242, 120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'mod-bootlegger Ironforge (placeholder)', 0),
(@GUID + 2, @ENTRY, 0,   0, 0, 1, 1, 0,  1553.6335,  245.93024,  -43.102673,  0.33393616, 120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'mod-bootlegger Undercity (placeholder)', 0),
(@GUID + 3, @ENTRY, 530, 0, 0, 1, 1, 0,  9648.34,  -7119.1,  28.6623,  0, 120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'mod-bootlegger Silvermoon (placeholder)', 0),
(@GUID + 4, @ENTRY, 530, 0, 0, 1, 1, 0, -3926.4404,  -11634.416,  -136.32631,  1.2810831, 120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'mod-bootlegger Exodar (placeholder)', 0),
(@GUID + 5, @ENTRY, 1,   0, 0, 1, 1, 0,  1595.6166,  -4382.303,  10.131312,  0.08241794, 120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'mod-bootlegger Orgrimmar (placeholder)', 0),
(@GUID + 6, @ENTRY, 1,   0, 0, 1, 1, 0, -1272.2773,  39.777576,  128.58109,  0.48063004, 120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'mod-bootlegger Thunder Bluff (placeholder)', 0),
(@GUID + 7, @ENTRY, 1,   0, 0, 1, 1, 0,  9909.689,  2514.1667,  1316.5652,  6.2061596, 120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'mod-bootlegger Darnassus (placeholder)', 0),
(@GUID + 8, @ENTRY, 571, 0, 0, 1, 1, 0,  5908.8213,  622.5901,  646.79724,  6.012333, 120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'mod-bootlegger Dalaran (placeholder)', 0),
(@GUID + 9, @ENTRY, 530, 0, 0, 1, 1, 0, -1920.563,  5434.8047,  1.215429,  6.2077394, 120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'mod-bootlegger Shattrath (placeholder)', 0);

