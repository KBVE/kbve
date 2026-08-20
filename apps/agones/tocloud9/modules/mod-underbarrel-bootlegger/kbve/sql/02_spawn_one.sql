-- Places one Fizzik. Edit the six values below, apply, done.
--
-- Get coordinates by standing where you want him in-game and running .gps:
-- it prints map and X/Y/Z. Orientation is the direction you are facing.
--
-- @GUID must stay inside the reserved band 7000100-7000199 (see ids.lock.yaml)
-- and must not collide with another spawn. Re-runnable for the same @GUID.

SET @ENTRY := 7000000;
SET @GUID  := 7000100;

SET @MAP   := 0;
SET @X     := -8876.078;
SET @Y     := 631.95886;
SET @Z     := 96.09245;
SET @O     := 0.7386191;

SET @COMMENT := 'Fizzik Underbarrel (KBVE)';

DELETE FROM `creature` WHERE `guid` = @GUID;
INSERT INTO `creature` (`guid`, `id1`, `map`, `zoneId`, `areaId`, `spawnMask`, `phaseMask`, `equipment_id`, `position_x`, `position_y`, `position_z`, `orientation`, `spawntimesecs`, `wander_distance`, `currentwaypoint`, `curhealth`, `curmana`, `MovementType`, `npcflag`, `unit_flags`, `dynamicflags`, `ScriptName`, `Comment`, `VerifiedBuild`) VALUES
(@GUID, @ENTRY, @MAP, 0, 0, 1, 1, 0, @X, @Y, @Z, @O, 120, 0, 0, 1, 0, 0, 0, 0, 0, '', @COMMENT, 0);
