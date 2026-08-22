#include "GroupXPScript.h"

#include "GroupXPConfig.h"

#include "Group.h"
#include "Player.h"

#include <algorithm>

GroupXPWorldScript::GroupXPWorldScript()
    : WorldScript("GroupXPWorldScript")
{
}

void GroupXPWorldScript::OnAfterConfigLoad(bool /*reload*/)
{
    GroupXPConfig::instance().Load();
}

GroupXPPlayerScript::GroupXPPlayerScript()
    : PlayerScript("GroupXPPlayerScript", { PLAYERHOOK_ON_REWARD_KILL_REWARDER })
{
}

void GroupXPPlayerScript::OnPlayerRewardKillRewarder(Player* player, KillRewarder* /*rewarder*/, bool /*isDungeon*/, float& rate)
{
    GroupXPSettings const& settings = GroupXPConfig::instance().Settings();

    if (!settings.enabled || !player)
        return;

    Group* group = player->GetGroup();
    if (!group)
        return;

    if (group->isRaidGroup() && !settings.raidGroups)
        return;

    if (player->InBattleground() && !settings.battlegrounds)
        return;

    float adjusted = settings.soloParity ? std::max(rate, 1.0f) : rate;
    adjusted *= 1.0f + settings.bonus;

    rate = std::min(adjusted, settings.maxRate);
}
