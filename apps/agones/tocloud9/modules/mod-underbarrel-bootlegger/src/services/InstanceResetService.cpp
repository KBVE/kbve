#include "InstanceResetService.h"

#include "BootlegActions.h"
#include "BootlegConfig.h"
#include "BootlegGossip.h"
#include "BootlegGossipUtil.h"
#include "BootlegPurchase.h"
#include "BootlegStrings.h"

#include "Chat.h"
#include "Group.h"
#include "InstanceSaveMgr.h"
#include "Map.h"
#include "Player.h"
#include "ScriptedGossip.h"

#include <vector>

namespace
{
enum InstancesAction : uint32
{
    INSTANCES_MENU = BOOTLEG_INSTANCES_BASE,
    INSTANCES_HEROIC_BRANCH = BOOTLEG_INSTANCES_BASE + 1,
    INSTANCES_HEROIC_SOLO = BOOTLEG_INSTANCES_BASE + 2,
    INSTANCES_HEROIC_GROUP = BOOTLEG_INSTANCES_BASE + 3,
    INSTANCES_RAID_BRANCH = BOOTLEG_INSTANCES_BASE + 4,
    INSTANCES_RAID_SOLO = BOOTLEG_INSTANCES_BASE + 5,
    INSTANCES_RAID_GROUP = BOOTLEG_INSTANCES_BASE + 6,
};

bool SaveMatchesType(InstanceSave* save, BootlegInstanceResetType type)
{
    if (!save || !save->GetMapEntry())
    {
        return false;
    }

    MapEntry const* mapEntry = save->GetMapEntry();

    if (type == BOOTLEG_INSTANCE_RAID)
    {
        return mapEntry->IsRaid();
    }

    return mapEntry->IsNonRaidDungeon() && save->GetDifficulty() == DUNGEON_DIFFICULTY_HEROIC;
}

bool IsEligibleGroupMember(Player* member)
{
    return member && member->GetSession() && member->IsInWorld();
}
} // namespace

char const* InstanceResetService::Key() const
{
    return "instances";
}

uint32 InstanceResetService::ActionBase() const
{
    return BOOTLEG_INSTANCES_BASE;
}

bool InstanceResetService::IsEnabled() const
{
    BootlegConfig const& config = BootlegConfig::instance();
    return config.IsEnabled() && config.Instances().enabled;
}

bool InstanceResetService::IsTypeEnabled(BootlegInstanceResetType type)
{
    BootlegInstancesConfig const& instances = BootlegConfig::instance().Instances();

    if (type == BOOTLEG_INSTANCE_HEROIC)
    {
        return instances.heroicEnabled;
    }

    return instances.raidEnabled;
}

uint32 InstanceResetService::GetTypeCostCopper(BootlegInstanceResetType type)
{
    BootlegInstancesConfig const& instances = BootlegConfig::instance().Instances();
    return type == BOOTLEG_INSTANCE_HEROIC ? instances.heroicCostCopper : instances.raidCostCopper;
}

bool InstanceResetService::HasSavedInstances(Player* player, BootlegInstanceResetType type)
{
    if (!player || !IsTypeEnabled(type))
    {
        return false;
    }

    for (uint8 i = 0; i < MAX_DIFFICULTY; ++i)
    {
        BoundInstancesMap const& instances = sInstanceSaveMgr->PlayerGetBoundInstances(player->GetGUID(), Difficulty(i));
        for (BoundInstancesMap::const_iterator itr = instances.begin(); itr != instances.end(); ++itr)
        {
            if (SaveMatchesType(itr->second.save, type))
            {
                return true;
            }
        }
    }

    return false;
}

bool InstanceResetService::PlayerMatchesTypeSave(Player* player, BootlegInstanceResetType type)
{
    return HasSavedInstances(player, type);
}

void InstanceResetService::ResetInstances(Player* player, BootlegInstanceResetType type)
{
    if (!player)
    {
        return;
    }

    for (uint8 i = 0; i < MAX_DIFFICULTY; ++i)
    {
        Difficulty const diff = Difficulty(i);
        BoundInstancesMap const& instances = sInstanceSaveMgr->PlayerGetBoundInstances(player->GetGUID(), diff);
        std::vector<uint32> mapIds;

        for (BoundInstancesMap::const_iterator itr = instances.begin(); itr != instances.end(); ++itr)
        {
            if (SaveMatchesType(itr->second.save, type))
            {
                mapIds.push_back(itr->first);
            }
        }

        for (uint32 mapId : mapIds)
        {
            sInstanceSaveMgr->PlayerUnbindInstance(player->GetGUID(), mapId, diff, true, player);
        }
    }
}

bool InstanceResetService::IsAvailable(Player* player) const
{
    if (!IsEnabled())
    {
        return false;
    }

    return HasSavedInstances(player, BOOTLEG_INSTANCE_HEROIC)
        || HasSavedInstances(player, BOOTLEG_INSTANCE_RAID);
}

void InstanceResetService::AddRootEntry(Player* player) const
{
    AddGossipItemFor(player, GOSSIP_ICON_CHAT, BOOTLEG_MENU_INSTANCES, GOSSIP_SENDER_MAIN, INSTANCES_MENU);
}

void InstanceResetService::ShowSubmenu(Player* player, Creature* creature) const
{
    ClearGossipMenuFor(player);

    bool const grouped = player->GetGroup() != nullptr;

    if (HasSavedInstances(player, BOOTLEG_INSTANCE_HEROIC))
    {
        uint32 const cost = GetTypeCostCopper(BOOTLEG_INSTANCE_HEROIC);
        if (grouped)
        {
            AddGossipItemFor(player, GOSSIP_ICON_VENDOR, BOOTLEG_INSTANCES_HEROIC,
                GOSSIP_SENDER_MAIN, INSTANCES_HEROIC_BRANCH);
        }
        else
        {
            BootlegAddPaidGossipItem(player, GOSSIP_ICON_VENDOR, BOOTLEG_INSTANCES_HEROIC,
                INSTANCES_HEROIC_SOLO, cost, BOOTLEG_CONFIRM_TRANSACTION);
        }
    }

    if (HasSavedInstances(player, BOOTLEG_INSTANCE_RAID))
    {
        uint32 const cost = GetTypeCostCopper(BOOTLEG_INSTANCE_RAID);
        if (grouped)
        {
            AddGossipItemFor(player, GOSSIP_ICON_VENDOR, BOOTLEG_INSTANCES_RAID,
                GOSSIP_SENDER_MAIN, INSTANCES_RAID_BRANCH);
        }
        else
        {
            BootlegAddPaidGossipItem(player, GOSSIP_ICON_VENDOR, BOOTLEG_INSTANCES_RAID,
                INSTANCES_RAID_SOLO, cost, BOOTLEG_CONFIRM_TRANSACTION);
        }
    }

    AddGossipItemFor(player, GOSSIP_ICON_CHAT, BOOTLEG_MENU_BACK, GOSSIP_SENDER_MAIN, BOOTLEG_ROOT_REFRESH);
    SendGossipMenuFor(player, BOOTLEG_NPC_TEXT_GREETING, creature->GetGUID());
}

void InstanceResetService::ShowScopeSubmenu(Player* player, Creature* creature, BootlegInstanceResetType type) const
{
    ClearGossipMenuFor(player);

    uint32 const cost = GetTypeCostCopper(type);
    uint32 soloAction = type == BOOTLEG_INSTANCE_HEROIC ? INSTANCES_HEROIC_SOLO : INSTANCES_RAID_SOLO;
    uint32 groupAction = type == BOOTLEG_INSTANCE_HEROIC ? INSTANCES_HEROIC_GROUP : INSTANCES_RAID_GROUP;

    BootlegAddPaidGossipItem(player, GOSSIP_ICON_VENDOR, BOOTLEG_INSTANCES_JUST_ME,
        soloAction, cost, BOOTLEG_CONFIRM_TRANSACTION);
    BootlegAddPaidGossipItem(player, GOSSIP_ICON_VENDOR, BOOTLEG_INSTANCES_WHOLE_GROUP,
        groupAction, cost, BOOTLEG_CONFIRM_TRANSACTION);
    AddGossipItemFor(player, GOSSIP_ICON_CHAT, BOOTLEG_MENU_BACK, GOSSIP_SENDER_MAIN, INSTANCES_MENU);

    SendGossipMenuFor(player, BOOTLEG_NPC_TEXT_GREETING, creature->GetGUID());
}

bool InstanceResetService::TryReset(Player* player, BootlegInstanceResetType type, bool groupScope)
{
    if (!player || !IsTypeEnabled(type))
    {
        return false;
    }

    if (!PlayerMatchesTypeSave(player, type))
    {
        return false;
    }

    uint32 const costCopper = GetTypeCostCopper(type);

    return BootlegPurchase(player, costCopper,
        [player, type]()
        {
            return IsTypeEnabled(type) && PlayerMatchesTypeSave(player, type);
        },
        [player, type, groupScope]()
        {
            if (groupScope)
            {
                if (Group* group = player->GetGroup())
                {
                    group->DoForAllMembers([type](Player* member)
                    {
                        if (!IsEligibleGroupMember(member))
                        {
                            return;
                        }

                        if (PlayerMatchesTypeSave(member, type))
                        {
                            ResetInstances(member, type);
                        }
                    });
                }

                ChatHandler(player->GetSession()).PSendSysMessage(BOOTLEG_MSG_INSTANCES_GROUP_RESET);
            }
            else
            {
                ResetInstances(player, type);
                ChatHandler(player->GetSession()).PSendSysMessage(
                    type == BOOTLEG_INSTANCE_HEROIC ? BOOTLEG_MSG_INSTANCES_HEROIC_RESET : BOOTLEG_MSG_INSTANCES_RAID_RESET);
            }
        });
}

bool InstanceResetService::HandleAction(Player* player, Creature* creature, uint32 action)
{
    if (action == INSTANCES_MENU)
    {
        if (!IsAvailable(player))
        {
            return false;
        }

        ShowSubmenu(player, creature);
        return false;
    }

    if (action == INSTANCES_HEROIC_BRANCH)
    {
        if (!player->GetGroup() || !HasSavedInstances(player, BOOTLEG_INSTANCE_HEROIC))
        {
            return false;
        }

        ShowScopeSubmenu(player, creature, BOOTLEG_INSTANCE_HEROIC);
        return false;
    }

    if (action == INSTANCES_RAID_BRANCH)
    {
        if (!player->GetGroup() || !HasSavedInstances(player, BOOTLEG_INSTANCE_RAID))
        {
            return false;
        }

        ShowScopeSubmenu(player, creature, BOOTLEG_INSTANCE_RAID);
        return false;
    }

    if (action == INSTANCES_HEROIC_SOLO)
    {
        if (!TryReset(player, BOOTLEG_INSTANCE_HEROIC, false))
        {
            return false;
        }

        // Reset complete; leave the window closed (see BootlegService.h contract).
        CloseGossipMenuFor(player);
        return false;
    }

    if (action == INSTANCES_HEROIC_GROUP)
    {
        if (!player->GetGroup())
        {
            return false;
        }

        if (!TryReset(player, BOOTLEG_INSTANCE_HEROIC, true))
        {
            return false;
        }

        CloseGossipMenuFor(player);
        return false;
    }

    if (action == INSTANCES_RAID_SOLO)
    {
        if (!TryReset(player, BOOTLEG_INSTANCE_RAID, false))
        {
            return false;
        }

        CloseGossipMenuFor(player);
        return false;
    }

    if (action == INSTANCES_RAID_GROUP)
    {
        if (!player->GetGroup())
        {
            return false;
        }

        if (!TryReset(player, BOOTLEG_INSTANCE_RAID, true))
        {
            return false;
        }

        CloseGossipMenuFor(player);
        return false;
    }

    return false;
}
