#include "GroupXPConfig.h"

#include "Config.h"
#include "Log.h"

#include <algorithm>

GroupXPConfig& GroupXPConfig::instance()
{
    static GroupXPConfig config;
    return config;
}

void GroupXPConfig::Load()
{
    GroupXPSettings settings;

    settings.enabled = sConfigMgr->GetOption<bool>("GroupXP.Enable", true);
    settings.soloParity = sConfigMgr->GetOption<bool>("GroupXP.SoloParity", true);
    settings.bonus = sConfigMgr->GetOption<float>("GroupXP.Bonus", 0.0f);
    settings.raidGroups = sConfigMgr->GetOption<bool>("GroupXP.RaidGroups", true);
    settings.battlegrounds = sConfigMgr->GetOption<bool>("GroupXP.Battlegrounds", false);
    settings.maxRate = sConfigMgr->GetOption<float>("GroupXP.MaxRate", 5.0f);

    settings.bonus = std::max(settings.bonus, -0.99f);
    settings.maxRate = std::max(settings.maxRate, 0.01f);

    _settings = settings;

    LOG_INFO("module", "mod-group-xp: enabled={} soloParity={} bonus={} raidGroups={} battlegrounds={} maxRate={}",
             settings.enabled, settings.soloParity, settings.bonus, settings.raidGroups,
             settings.battlegrounds, settings.maxRate);
}
