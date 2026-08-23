UPDATE `creature_template` SET
    `VehicleId` = 8,
    `npcflag`   = `npcflag` | 16777216,
    `faction`   = 35,
    `speed_run` = 1.5,
    `AIName`    = 'SmartAI'
WHERE `entry` = 27838;

DELETE FROM `creature_template_movement` WHERE `CreatureId` = 27838;
INSERT INTO `creature_template_movement` (`CreatureId`, `Ground`, `Swim`, `Flight`, `Rooted`) VALUES
(27838, 1, 1, 2, 0);

DELETE FROM `npc_spellclick_spells` WHERE `npc_entry` = 27838;
INSERT INTO `npc_spellclick_spells` (`npc_entry`, `spell_id`, `cast_flags`, `user_type`) VALUES
(27838, 46598, 1, 0);

DELETE FROM `creature_template_spell` WHERE `CreatureID` = 27838;
INSERT INTO `creature_template_spell` (`CreatureID`, `Spell`, `Index`) VALUES
(27838, 43770, 0),
(27838, 44009, 1),
(27838, 43799, 2),
(27838, 43769, 3),
(27838, 47769, 4);

DELETE FROM `smart_scripts` WHERE `entryorguid` = 27838 AND `source_type` = 0;
INSERT INTO `smart_scripts`
(`entryorguid`, `source_type`, `id`, `link`, `event_type`, `event_phase_mask`, `event_chance`, `event_flags`,
 `event_param1`, `event_param2`, `event_param3`, `event_param4`, `event_param5`, `event_param6`,
 `action_type`, `action_param1`, `action_param2`, `action_param3`, `action_param4`, `action_param5`, `action_param6`,
 `target_type`, `target_param1`, `target_param2`, `target_param3`, `target_param4`,
 `target_x`, `target_y`, `target_z`, `target_o`, `comment`) VALUES
(27838, 0, 0, 0, 29, 0, 100, 512, 0,0,0,0,0,0, 60, 1, 300, 1, 0,0,0, 1, 0,0,0,0, 0,0,0,0,
 'Wintergrasp Fighter Plane - On Charmed - Set Flight'),
(27838, 0, 1, 0, 27, 0, 100, 512, 0,0,0,0,0,0, 60, 1, 300, 1, 0,0,0, 1, 0,0,0,0, 0,0,0,0,
 'Wintergrasp Fighter Plane - On Passenger Boarded - Set Flight');
