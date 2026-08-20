#ifndef BOOTLEG_PROFESSION_DATA_H
#define BOOTLEG_PROFESSION_DATA_H

#include "BootlegConfig.h"

#include <cstddef>

struct BootlegProfession
{
    uint32 skillId;
    char const* name;
    // Trainer rank spells for Journeyman..Grand Master, indexed by
    // BootlegProfessionTier. Learning the spell raises the skill cap natively,
    // makes trainers recognize the rank, and persists across relog.
    uint32 rankSpellIds[BOOTLEG_TIER_COUNT];
};

struct BootlegProfessionTierDef
{
    uint8 rank;
    uint16 maxSkill;
    BootlegProfessionTier configTier;
};

extern BootlegProfession const kBootlegProfessions[];
extern std::size_t const kBootlegProfessionCount;

extern BootlegProfessionTierDef const kBootlegTierLadder[];
extern std::size_t const kBootlegTierLadderCount;

struct BootlegNextProfessionTier
{
    BootlegProfessionTierDef const* tierDef;
    BootlegTierConfig const* tierConfig;
};

bool BootlegFindNextProfessionTier(uint32 currentMax, BootlegNextProfessionTier* out);

#endif
