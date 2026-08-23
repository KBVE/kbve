#ifndef GROUP_XP_SCRIPT_H
#define GROUP_XP_SCRIPT_H

#include "ScriptMgr.h"

class GroupXPWorldScript : public WorldScript
{
public:
    GroupXPWorldScript();

    void OnAfterConfigLoad(bool reload) override;
};

class GroupXPPlayerScript : public PlayerScript
{
public:
    GroupXPPlayerScript();

    void OnPlayerRewardKillRewarder(Player* player, KillRewarder* rewarder, bool isDungeon, float& rate) override;
};

#endif
