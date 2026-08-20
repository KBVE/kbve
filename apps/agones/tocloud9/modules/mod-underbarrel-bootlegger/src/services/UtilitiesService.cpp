#include "UtilitiesService.h"

#include "BootlegActions.h"
#include "BootlegConfig.h"
#include "BootlegGossip.h"
#include "BootlegGossipUtil.h"
#include "BootlegPurchase.h"
#include "BootlegStrings.h"

#include "Chat.h"
#include "Player.h"
#include "ScriptedGossip.h"

namespace
{
enum UtilitiesAction : uint32
{
    UTILITIES_MENU = BOOTLEG_UTILITIES_BASE,
    UTILITIES_NAME = BOOTLEG_UTILITIES_BASE + 1,
    UTILITIES_APPEARANCE = BOOTLEG_UTILITIES_BASE + 2,
    UTILITIES_RACE = BOOTLEG_UTILITIES_BASE + 3,
    UTILITIES_FACTION = BOOTLEG_UTILITIES_BASE + 4,
};
} // namespace

char const* UtilitiesService::Key() const
{
    return "utilities";
}

uint32 UtilitiesService::ActionBase() const
{
    return BOOTLEG_UTILITIES_BASE;
}

bool UtilitiesService::IsEnabled() const
{
    BootlegConfig const& config = BootlegConfig::instance();
    return config.IsEnabled() && config.Utilities().enabled;
}

bool UtilitiesService::HasPendingUtilityChange(Player* player)
{
    if (!player)
    {
        return false;
    }

    return player->HasAtLoginFlag(AT_LOGIN_RENAME)
        || player->HasAtLoginFlag(AT_LOGIN_CUSTOMIZE)
        || player->HasAtLoginFlag(AT_LOGIN_CHANGE_RACE)
        || player->HasAtLoginFlag(AT_LOGIN_CHANGE_FACTION);
}

bool UtilitiesService::IsAvailable(Player* player) const
{
    return IsEnabled() && !HasPendingUtilityChange(player);
}

void UtilitiesService::AddRootEntry(Player* player) const
{
    AddGossipItemFor(player, GOSSIP_ICON_CHAT, BOOTLEG_MENU_UTILITIES, GOSSIP_SENDER_MAIN, UTILITIES_MENU);
}

void UtilitiesService::ShowSubmenu(Player* player, Creature* creature) const
{
    BootlegUtilitiesConfig const& utilities = BootlegConfig::instance().Utilities();

    ClearGossipMenuFor(player);

    BootlegAddPaidGossipItem(player, GOSSIP_ICON_VENDOR, BOOTLEG_UTIL_NAME,
        UTILITIES_NAME, utilities.nameChangeCostCopper, BOOTLEG_CONFIRM_TRANSACTION);

    BootlegAddPaidGossipItem(player, GOSSIP_ICON_VENDOR, BOOTLEG_UTIL_APPEARANCE,
        UTILITIES_APPEARANCE, utilities.customizeCostCopper, BOOTLEG_CONFIRM_TRANSACTION);

    BootlegAddPaidGossipItem(player, GOSSIP_ICON_VENDOR, BOOTLEG_UTIL_RACE,
        UTILITIES_RACE, utilities.raceChangeCostCopper, BOOTLEG_CONFIRM_TRANSACTION);

    BootlegAddPaidGossipItem(player, GOSSIP_ICON_VENDOR, BOOTLEG_UTIL_FACTION,
        UTILITIES_FACTION, utilities.factionChangeCostCopper, BOOTLEG_CONFIRM_TRANSACTION);

    AddGossipItemFor(player, GOSSIP_ICON_CHAT, BOOTLEG_MENU_BACK, GOSSIP_SENDER_MAIN, BOOTLEG_ROOT_REFRESH);
    SendGossipMenuFor(player, BOOTLEG_NPC_TEXT_GREETING, creature->GetGUID());
}

bool UtilitiesService::TryPurchaseUtility(Player* player, AtLoginFlags flag, uint32 costCopper)
{
    return BootlegPurchase(player, costCopper,
        [player]()
        {
            if (HasPendingUtilityChange(player))
            {
                ChatHandler(player->GetSession()).PSendSysMessage(BOOTLEG_MSG_UTILITY_IN_PROGRESS);
                return false;
            }
            return true;
        },
        [player, flag]()
        {
            player->SetAtLoginFlag(flag);
            ChatHandler(player->GetSession()).PSendSysMessage(BOOTLEG_MSG_UTILITY_DONE);
        });
}

bool UtilitiesService::HandleAction(Player* player, Creature* creature, uint32 action)
{
    if (action == UTILITIES_MENU)
    {
        if (!IsAvailable(player))
        {
            return false;
        }

        ShowSubmenu(player, creature);
        return false;
    }

    BootlegUtilitiesConfig const& utilities = BootlegConfig::instance().Utilities();
    AtLoginFlags flag = AT_LOGIN_NONE;
    uint32 costCopper = 0;

    switch (action)
    {
    case UTILITIES_NAME:
        flag = AT_LOGIN_RENAME;
        costCopper = utilities.nameChangeCostCopper;
        break;
    case UTILITIES_APPEARANCE:
        flag = AT_LOGIN_CUSTOMIZE;
        costCopper = utilities.customizeCostCopper;
        break;
    case UTILITIES_RACE:
        flag = AT_LOGIN_CHANGE_RACE;
        costCopper = utilities.raceChangeCostCopper;
        break;
    case UTILITIES_FACTION:
        flag = AT_LOGIN_CHANGE_FACTION;
        costCopper = utilities.factionChangeCostCopper;
        break;
    default:
        return false;
    }

    if (!IsEnabled())
    {
        return false;
    }

    if (!TryPurchaseUtility(player, flag, costCopper))
    {
        return false;
    }

    // Purchase complete; the player must relog, so leave the window closed.
    CloseGossipMenuFor(player);
    return false;
}
