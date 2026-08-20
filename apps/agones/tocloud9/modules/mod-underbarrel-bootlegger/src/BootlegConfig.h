#ifndef BOOTLEG_CONFIG_H
#define BOOTLEG_CONFIG_H

#include "Common.h"

enum BootlegProfessionTier : uint8
{
    BOOTLEG_TIER_JOURNEYMAN = 0,
    BOOTLEG_TIER_EXPERT,
    BOOTLEG_TIER_ARTISAN,
    BOOTLEG_TIER_MASTER,
    BOOTLEG_TIER_GRAND_MASTER,
    BOOTLEG_TIER_COUNT
};

struct BootlegTierConfig
{
    bool enabled = false;
    uint32 costCopper = 0;
    uint32 requiredLevel = 0;
};

struct BootlegUtilitiesConfig
{
    bool enabled = false;
    uint32 nameChangeCostCopper = 0;
    uint32 customizeCostCopper = 0;
    uint32 raceChangeCostCopper = 0;
    uint32 factionChangeCostCopper = 0;
};

struct BootlegProfessionsConfig
{
    bool enabled = false;
    BootlegTierConfig tiers[BOOTLEG_TIER_COUNT];
};

struct BootlegInstancesConfig
{
    bool enabled = false;
    bool heroicEnabled = false;
    uint32 heroicCostCopper = 0;
    bool raidEnabled = false;
    uint32 raidCostCopper = 0;
};

class BootlegConfig
{
public:
    static BootlegConfig& instance();

    void Load();

    bool IsEnabled() const { return _enabled; }
    BootlegUtilitiesConfig const& Utilities() const { return _utilities; }
    BootlegProfessionsConfig const& Professions() const { return _professions; }
    BootlegInstancesConfig const& Instances() const { return _instances; }

    static uint32 GoldToCopper(uint32 gold);

private:
    BootlegConfig() = default;

    bool _enabled = true;
    BootlegUtilitiesConfig _utilities;
    BootlegProfessionsConfig _professions;
    BootlegInstancesConfig _instances;
};

#endif
