-- `creature`.`id`, not `id1`. The core this stack builds from
-- (3kynox/azerothcore-wotlk) still ships the single-`id` schema, and writing
-- `id1` fails the whole file after the statements above have committed, which
-- leaves the module half-installed and every db-import retry failing.

DELETE FROM `creature_template` WHERE `entry` = 900400;
INSERT INTO `creature_template`
(`entry`, `name`, `subname`, `minlevel`, `maxlevel`, `faction`, `npcflag`, `speed_walk`, `speed_run`,
 `unit_class`, `unit_flags`, `type`, `type_flags`, `RegenHealth`, `MovementType`, `AIName`, `ScriptName`) VALUES
(900400, 'Sizzik Vaneblast', 'Booty Bay Air Command', 60, 60, 35, 1, 1, 1.14286, 1, 512, 7, 0, 1, 0, '', 'npc_dragon_wars');

DELETE FROM `creature_template_model` WHERE `CreatureID` = 900400;
INSERT INTO `creature_template_model` (`CreatureID`, `Idx`, `CreatureDisplayID`, `DisplayScale`, `Probability`) VALUES
(900400, 0, 7212, 1, 1);

-- Booty Bay main deck, z 15.20. Bounded by Crank Fizzlebub (-14453.4, 490.26),
-- Innkeeper Skindle (-14457.7, 495.35) and Zandalarian Emissary (-14449.9,
-- 479.18), all spawned between z 15.19 and 15.21, so this sits on the same
-- flat decking rather than the two-NPC balcony above it.
DELETE FROM `creature` WHERE `guid` = 9004000;
INSERT INTO `creature`
(`guid`, `id`, `map`, `spawnMask`, `phaseMask`, `position_x`, `position_y`, `position_z`, `orientation`,
 `spawntimesecs`, `wander_distance`, `MovementType`, `Comment`) VALUES
(9004000, 900400, 0, 1, 1, -14449.00, 486.00, 15.20, 1.50, 300, 0, 0, 'mod-dragon-wars Booty Bay');

DELETE FROM `npc_text` WHERE `ID` = 90040;
INSERT INTO `npc_text` (`ID`, `text0_0`, `text0_1`, `VerifiedBuild`) VALUES
(90040, 'The hangar is full and the sky is empty. Bring me five and I will put every one of you in a cockpit.', 'The hangar is full and the sky is empty. Bring me five and I will put every one of you in a cockpit.', 0);
