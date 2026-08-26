-- World-side removal. Run against acore_world.
-- The sortie log lives in the characters database; see uninstall_characters.sql.

DELETE FROM `creature` WHERE `guid` = 9004000;
DELETE FROM `creature_template_model` WHERE `CreatureID` = 900400;
DELETE FROM `creature_template` WHERE `entry` = 900400;
DELETE FROM `npc_text` WHERE `ID` BETWEEN 90040 AND 90042;
