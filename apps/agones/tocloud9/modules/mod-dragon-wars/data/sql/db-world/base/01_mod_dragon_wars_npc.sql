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

-- Booty Bay dock plaza, z 8.95. Planes are summoned at each pilot's own
-- position, so the airfield needs sky above it -- the tavern deck and the
-- balcony above that are both roofed. Twelve spawns sit within 18 yards of
-- this point between z 8.70 and 9.25 (Wonderform Operator at 3.1, Captain
-- Hecklebury Smotts at 6.1, Sprogger at 8.0), so the decking is flat and the
-- height is measured rather than guessed.
DELETE FROM `creature` WHERE `guid` = 9004000;
INSERT INTO `creature`
(`guid`, `id`, `map`, `spawnMask`, `phaseMask`, `position_x`, `position_y`, `position_z`, `orientation`,
 `spawntimesecs`, `wander_distance`, `MovementType`, `Comment`) VALUES
(9004000, 900400, 0, 1, 1, -14290.00, 512.00, 8.95, 1.20, 300, 0, 0, 'mod-dragon-wars Booty Bay dock');

DELETE FROM `npc_text` WHERE `ID` BETWEEN 90040 AND 90042;
INSERT INTO `npc_text` (`ID`, `text0_0`, `text0_1`, `VerifiedBuild`) VALUES
(90040,
 'Five of you, five of them in the hangar. That is the whole arrangement. Get in, get up, and put something sharp into that wyrm before it comes back down the coast and takes another one of my ships.',
 'Five of you, five of them in the hangar. That is the whole arrangement. Get in, get up, and put something sharp into that wyrm before it comes back down the coast and takes another one of my ships.',
 0),
(90041,
 'Wintergrasp. Where else? The Alliance and the Horde spent a winter shooting each other out of the sky up there, and neither of them thought to count the wrecks afterward. I counted. I shipped. Bloodsail take a cut, the Cartel takes a bigger one, and what is left flies out of my dock. They are salvage, so do not get attached, and do not ask what the previous pilot was called.',
 'Wintergrasp. Where else? The Alliance and the Horde spent a winter shooting each other out of the sky up there, and neither of them thought to count the wrecks afterward. I counted. I shipped. Bloodsail take a cut, the Cartel takes a bigger one, and what is left flies out of my dock. They are salvage, so do not get attached, and do not ask what the previous pilot was called.',
 0),
(90042,
 'Planes are fuelled and the hangar doors are open, but I am not sending anyone up alone. That thing over the hills eats lone fliers. Bring me a full crew and we will talk about getting you airborne.',
 'Planes are fuelled and the hangar doors are open, but I am not sending anyone up alone. That thing over the hills eats lone fliers. Bring me a full crew and we will talk about getting you airborne.',
 0);
