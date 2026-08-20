UPDATE acore_auth.realmlist SET name = 'KBVE', icon = 1 WHERE id = 1;

UPDATE acore_auth.motd SET text = 'Welcome to KBVE WoW' WHERE realmid IN (-1, 1);
