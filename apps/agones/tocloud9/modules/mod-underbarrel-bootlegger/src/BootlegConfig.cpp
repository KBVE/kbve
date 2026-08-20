#include "BootlegConfig.h"

#include "Config.h"
#include "Log.h"

#include <string>

namespace
{
uint32 LoadGoldCost(char const* key, uint32 defaultGold)
{
    return BootlegConfig::GoldToCopper(sConfigMgr->GetOption<uint32>(key, defaultGold));
}

BootlegTierConfig LoadTierConfig(char const* tierName, bool defaultEnabled, uint32 defaultGold)
{
    BootlegTierConfig tier;
    std::string enableKey = std::string("Bootleg.Professions.") + tierName + ".Enable";
    std::string costKey = std::string("Bootleg.Professions.") + tierName + ".Cost";
    std::string levelKey = std::string("Bootleg.Professions.") + tierName + ".RequiredLevel";

    tier.enabled = sConfigMgr->GetOption<bool>(enableKey, defaultEnabled);
    tier.costCopper = LoadGoldCost(costKey.c_str(), defaultGold);
    tier.requiredLevel = sConfigMgr->GetOption<uint32>(levelKey.c_str(), 0);
    return tier;
}
} // namespace

BootlegConfig& BootlegConfig::instance()
{
    static BootlegConfig config;
    return config;
}

uint32 BootlegConfig::GoldToCopper(uint32 gold)
{
    static uint32 const MAX_GOLD = 21474u;

    if (gold > MAX_GOLD)
    {
        LOG_WARN("server.loading", ">> Bootleg: gold cost {} exceeds max ({}); clamping", gold, MAX_GOLD);
        gold = MAX_GOLD;
    }

    return gold * 10000u;
}

void BootlegConfig::Load()
{
    _enabled = sConfigMgr->GetOption<bool>("Bootleg.Enable", true);

    _utilities.enabled = sConfigMgr->GetOption<bool>("Bootleg.Utilities.Enable", true);
    _utilities.nameChangeCostCopper = LoadGoldCost("Bootleg.Utilities.NameChange.Cost", 10);
    _utilities.customizeCostCopper = LoadGoldCost("Bootleg.Utilities.Customize.Cost", 50);
    _utilities.raceChangeCostCopper = LoadGoldCost("Bootleg.Utilities.RaceChange.Cost", 500);
    _utilities.factionChangeCostCopper = LoadGoldCost("Bootleg.Utilities.FactionChange.Cost", 1000);

    _professions.enabled = sConfigMgr->GetOption<bool>("Bootleg.Professions.Enable", true);
    _professions.tiers[BOOTLEG_TIER_JOURNEYMAN] = LoadTierConfig("Journeyman", true, 100);
    _professions.tiers[BOOTLEG_TIER_EXPERT] = LoadTierConfig("Expert", true, 250);
    _professions.tiers[BOOTLEG_TIER_ARTISAN] = LoadTierConfig("Artisan", true, 750);
    _professions.tiers[BOOTLEG_TIER_MASTER] = LoadTierConfig("Master", false, 1250);
    _professions.tiers[BOOTLEG_TIER_GRAND_MASTER] = LoadTierConfig("GrandMaster", false, 2500);

    _instances.enabled = sConfigMgr->GetOption<bool>("Bootleg.Instances.Enable", true);
    _instances.heroicEnabled = sConfigMgr->GetOption<bool>("Bootleg.Instances.Heroic.Enable", true);
    _instances.heroicCostCopper = LoadGoldCost("Bootleg.Instances.Heroic.Cost", 10);
    _instances.raidEnabled = sConfigMgr->GetOption<bool>("Bootleg.Instances.Raid.Enable", true);
    _instances.raidCostCopper = LoadGoldCost("Bootleg.Instances.Raid.Cost", 100);

    LOG_INFO("server.loading", ">> Bootleg: master enable = {}", _enabled ? "yes" : "no");
}
