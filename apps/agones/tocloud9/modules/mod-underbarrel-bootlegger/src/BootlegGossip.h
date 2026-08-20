#ifndef BOOTLEG_GOSSIP_H
#define BOOTLEG_GOSSIP_H

#include "ScriptMgr.h"
#include "ScriptedGossip.h"

// Must match @TEXT_ID in data/sql/db-world/mod_bootlegger.sql
enum BootlegNpcText : uint32
{
    BOOTLEG_NPC_TEXT_GREETING = 7000200
};

class BootlegCreatureScript : public CreatureScript
{
public:
    BootlegCreatureScript();

    bool OnGossipHello(Player* player, Creature* creature) override;
    bool OnGossipSelect(Player* player, Creature* creature, uint32 sender, uint32 action) override;
};

#endif
