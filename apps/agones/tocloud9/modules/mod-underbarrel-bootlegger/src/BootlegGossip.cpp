#include "BootlegGossip.h"

#include "BootlegActions.h"
#include "BootlegConfig.h"
#include "BootlegRegistry.h"

BootlegCreatureScript::BootlegCreatureScript()
    : CreatureScript("npc_bootlegger")
{
}

bool BootlegCreatureScript::OnGossipHello(Player* player, Creature* creature)
{
    ClearGossipMenuFor(player);

    if (BootlegConfig::instance().IsEnabled())
    {
        BootlegRegistry::instance().AddRootEntries(player);
    }

    SendGossipMenuFor(player, BOOTLEG_NPC_TEXT_GREETING, creature->GetGUID());
    return true;
}

bool BootlegCreatureScript::OnGossipSelect(Player* player, Creature* creature, uint32 sender, uint32 action)
{
    if (sender != GOSSIP_SENDER_MAIN)
    {
        return true;
    }

    if (action == BOOTLEG_ROOT_REFRESH)
    {
        OnGossipHello(player, creature);
        return true;
    }

    if (BootlegRegistry::instance().HandleAction(player, creature, action))
    {
        OnGossipHello(player, creature);
    }

    return true;
}
