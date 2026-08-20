-- Removes every Fizzik spawn, leaving the template, model and gossip text in
-- place so he can be re-placed without reinstalling. To remove him entirely,
-- use upstream data/sql/uninstall/mod_bootlegger_uninstall.sql instead.

SET @GUID := 7000100;

DELETE FROM `creature` WHERE `guid` BETWEEN @GUID AND @GUID + 99;
