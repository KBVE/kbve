#include "ProfessionsService.h"

#include "BootlegActions.h"
#include "BootlegConfig.h"
#include "BootlegGossip.h"
#include "BootlegGossipUtil.h"
#include "BootlegProfessionData.h"
#include "BootlegPurchase.h"
#include "BootlegStrings.h"

#include "Chat.h"
#include "Player.h"
#include "ScriptedGossip.h"
#include "StringFormat.h"

#include <algorithm>

namespace
{
enum ProfessionsAction : uint32
{
    PROFESSIONS_MENU = BOOTLEG_PROFESSIONS_BASE,
    PROFESSIONS_FIRST_PURCHASE = BOOTLEG_PROFESSIONS_BASE + 1,
};

std::string FormatProfessionLabel(BootlegProfession const& profession, BootlegNextProfessionTier const& nextTier)
{
    char const* tierName = "Unknown";

    switch (nextTier.tierDef->configTier)
    {
    case BOOTLEG_TIER_JOURNEYMAN:    tierName = "Journeyman"; break;
    case BOOTLEG_TIER_EXPERT:        tierName = "Expert"; break;
    case BOOTLEG_TIER_ARTISAN:       tierName = "Artisan"; break;
    case BOOTLEG_TIER_MASTER:        tierName = "Master"; break;
    case BOOTLEG_TIER_GRAND_MASTER:  tierName = "Grand Master"; break;
    default: break;
    }

    return Acore::StringFormat("Advance {} to {}", profession.name, tierName);
}
} // namespace

char const* ProfessionsService::Key() const
{
    return "professions";
}

uint32 ProfessionsService::ActionBase() const
{
    return BOOTLEG_PROFESSIONS_BASE;
}

bool ProfessionsService::IsEnabled() const
{
    BootlegConfig const& config = BootlegConfig::instance();
    return config.IsEnabled() && config.Professions().enabled;
}

bool ProfessionsService::TryGetNextTier(Player* player, BootlegProfession const& profession, BootlegNextProfessionTier* out)
{
    if (!player || !player->HasSkill(profession.skillId))
    {
        return false;
    }

    return BootlegFindNextProfessionTier(player->GetPureMaxSkillValue(profession.skillId), out);
}

bool ProfessionsService::CanAdvanceProfession(Player* player, BootlegProfession const& profession, BootlegNextProfessionTier const& nextTier)
{
    if (!player->HasSkill(profession.skillId))
    {
        return false;
    }

    if (player->GetPureMaxSkillValue(profession.skillId) >= nextTier.tierDef->maxSkill)
    {
        return false;
    }

    if (!nextTier.tierConfig->enabled)
    {
        return false;
    }

    if (nextTier.tierConfig->requiredLevel > 0 && player->GetLevel() < nextTier.tierConfig->requiredLevel)
    {
        return false;
    }

    BootlegNextProfessionTier liveNextTier;
    if (!TryGetNextTier(player, profession, &liveNextTier))
    {
        return false;
    }

    return liveNextTier.tierDef->maxSkill == nextTier.tierDef->maxSkill;
}

bool ProfessionsService::IsAvailable(Player* player) const
{
    if (!IsEnabled())
    {
        return false;
    }

    for (std::size_t i = 0; i < kBootlegProfessionCount; ++i)
    {
        BootlegNextProfessionTier nextTier;
        if (TryGetNextTier(player, kBootlegProfessions[i], &nextTier)
            && CanAdvanceProfession(player, kBootlegProfessions[i], nextTier))
        {
            return true;
        }
    }

    return false;
}

void ProfessionsService::AddRootEntry(Player* player) const
{
    AddGossipItemFor(player, GOSSIP_ICON_CHAT, BOOTLEG_MENU_PROFESSIONS, GOSSIP_SENDER_MAIN, PROFESSIONS_MENU);
}

void ProfessionsService::ShowSubmenu(Player* player, Creature* creature) const
{
    ClearGossipMenuFor(player);

    for (std::size_t i = 0; i < kBootlegProfessionCount; ++i)
    {
        BootlegProfession const& profession = kBootlegProfessions[i];
        BootlegNextProfessionTier nextTier;

        if (!TryGetNextTier(player, profession, &nextTier))
        {
            continue;
        }

        if (!CanAdvanceProfession(player, profession, nextTier))
        {
            continue;
        }

        uint32 const action = static_cast<uint32>(PROFESSIONS_FIRST_PURCHASE + i);
        BootlegAddPaidGossipItem(player, GOSSIP_ICON_TRAINER,
            FormatProfessionLabel(profession, nextTier),
            action, nextTier.tierConfig->costCopper, BOOTLEG_CONFIRM_TRANSACTION);
    }

    AddGossipItemFor(player, GOSSIP_ICON_CHAT, BOOTLEG_MENU_BACK, GOSSIP_SENDER_MAIN, BOOTLEG_ROOT_REFRESH);
    SendGossipMenuFor(player, BOOTLEG_NPC_TEXT_GREETING, creature->GetGUID());
}

bool ProfessionsService::TryAdvanceProfession(Player* player, std::size_t professionIndex)
{
    if (professionIndex >= kBootlegProfessionCount)
    {
        return false;
    }

    BootlegProfession const profession = kBootlegProfessions[professionIndex];

    BootlegNextProfessionTier nextTier;
    if (!TryGetNextTier(player, profession, &nextTier))
    {
        return false;
    }

    uint32 const costCopper = nextTier.tierConfig->costCopper;
    uint8 const nextRank = nextTier.tierDef->rank;
    uint16 const nextMax = nextTier.tierDef->maxSkill;
    uint32 const skillId = profession.skillId;
    uint32 const rankSpellId = profession.rankSpellIds[nextTier.tierDef->configTier];
    BootlegNextProfessionTier const nextTierCopy = nextTier;

    return BootlegPurchase(player, costCopper,
        [player, profession, nextTierCopy]()
        {
            return CanAdvanceProfession(player, profession, nextTierCopy);
        },
        [player, skillId, nextRank, nextMax, rankSpellId]()
        {
            uint16 const previousCap = player->GetPureMaxSkillValue(skillId);

            // Learning the trainer rank spell raises the cap natively (core
            // SpellLearnSkill path), makes trainers recognize the new rank,
            // and persists across relog. SetSkill alone does none of that.
            player->learnSpell(rankSpellId, false);

            // Top the skill value up to the tier boundary the player just
            // outgrew (e.g. 1/75 buying Journeyman -> 75/150), never lower it.
            uint16 const filledValue = std::max(player->GetPureSkillValue(skillId), previousCap);
            player->SetSkill(skillId, nextRank, filledValue, nextMax);

            ChatHandler(player->GetSession()).PSendSysMessage(BOOTLEG_MSG_PROFESSION_ADVANCED, nextMax);
        });
}

bool ProfessionsService::HandleAction(Player* player, Creature* creature, uint32 action)
{
    if (action == PROFESSIONS_MENU)
    {
        if (!IsAvailable(player))
        {
            return false;
        }

        ShowSubmenu(player, creature);
        return false;
    }

    if (action < PROFESSIONS_FIRST_PURCHASE
        || action >= PROFESSIONS_FIRST_PURCHASE + kBootlegProfessionCount)
    {
        return false;
    }

    if (!IsEnabled())
    {
        return false;
    }

    std::size_t const professionIndex = action - PROFESSIONS_FIRST_PURCHASE;

    if (!TryAdvanceProfession(player, professionIndex))
    {
        return false;
    }

    return true;
}
