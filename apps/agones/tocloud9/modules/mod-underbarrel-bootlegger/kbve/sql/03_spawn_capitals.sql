-- All ten capitals, guids 7000100-7000109. Coordinates are upstream's and are
-- marked "placeholder" there -- nobody has stood on them. Expect some to sit in
-- geometry or float until each is replaced with a .gps reading.
--
-- Re-runnable. Prefer 02_spawn_one.sql while placements are still being chosen.

SET @ENTRY := 7000000;
SET @GUID  := 7000100;

DELETE FROM `creature` WHERE `guid` BETWEEN @GUID AND @GUID + 9;
INSERT INTO `creature` (`guid`, `id1`, `map`, `zoneId`, `areaId`, `spawnMask`, `phaseMask`, `equipment_id`, `position_x`, `position_y`, `position_z`, `orientation`, `spawntimesecs`, `wander_distance`, `currentwaypoint`, `curhealth`, `curmana`, `MovementType`, `npcflag`, `unit_flags`, `dynamicflags`, `ScriptName`, `Comment`, `VerifiedBuild`) VALUES
(@GUID + 0, @ENTRY, 0,   0, 0, 1, 1, 0, -8876.078,   631.95886,   96.09245,   0.7386191,  120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'Fizzik Stormwind (unverified)', 0),
(@GUID + 1, @ENTRY, 0,   0, 0, 1, 1, 0, -4888.706,  -962.2678,   501.45255,   1.622242,   120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'Fizzik Ironforge (unverified)', 0),
(@GUID + 2, @ENTRY, 0,   0, 0, 1, 1, 0,  1553.6335,  245.93024,  -43.102673,  0.33393616, 120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'Fizzik Undercity (unverified)', 0),
(@GUID + 3, @ENTRY, 530, 0, 0, 1, 1, 0,  9648.34,   -7119.1,      28.6623,    0,          120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'Fizzik Silvermoon (unverified)', 0),
(@GUID + 4, @ENTRY, 530, 0, 0, 1, 1, 0, -3926.4404, -11634.416,  -136.32631,  1.2810831,  120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'Fizzik Exodar (unverified)', 0),
(@GUID + 5, @ENTRY, 1,   0, 0, 1, 1, 0,  1595.6166, -4382.303,    10.131312,  0.08241794, 120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'Fizzik Orgrimmar (unverified)', 0),
(@GUID + 6, @ENTRY, 1,   0, 0, 1, 1, 0, -1272.2773,  39.777576,  128.58109,   0.48063004, 120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'Fizzik Thunder Bluff (unverified)', 0),
(@GUID + 7, @ENTRY, 1,   0, 0, 1, 1, 0,  9909.689,   2514.1667,  1316.5652,   6.2061596,  120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'Fizzik Darnassus (unverified)', 0),
(@GUID + 8, @ENTRY, 571, 0, 0, 1, 1, 0,  5908.8213,  622.5901,   646.79724,   6.012333,   120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'Fizzik Dalaran (unverified)', 0),
(@GUID + 9, @ENTRY, 530, 0, 0, 1, 1, 0, -1920.563,   5434.8047,    1.215429,  6.2077394,  120, 0, 0, 1, 0, 0, 0, 0, 0, '', 'Fizzik Shattrath (unverified)', 0);
