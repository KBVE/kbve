#ifndef GROUP_XP_CONFIG_H
#define GROUP_XP_CONFIG_H

#include "Common.h"

struct GroupXPSettings
{
    bool enabled = true;
    bool soloParity = true;
    float bonus = 0.0f;
    bool raidGroups = true;
    bool battlegrounds = false;
    float maxRate = 5.0f;
};

class GroupXPConfig
{
public:
    static GroupXPConfig& instance();

    void Load();

    GroupXPSettings const& Settings() const { return _settings; }

private:
    GroupXPConfig() = default;

    GroupXPSettings _settings;
};

#endif
