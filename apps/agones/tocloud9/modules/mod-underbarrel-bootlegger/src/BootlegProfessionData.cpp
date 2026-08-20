#include "BootlegProfessionData.h"

#include "BootlegConfig.h"
#include "SharedDefines.h"

// Rank spell IDs (Journeyman..Grand Master) derived from acore_world
// spell_ranks chains (first_spell_id = each profession's rank-1 spell),
// queried via MOD_UAC_WORLD_DATABASE_INFO on 2026-07-09. Ranks 2..6 of each
// chain are the tier spells the trainers teach; learning them raises the cap
// through the core's SpellLearnSkill path (SPELL_EFFECT_SKILL).
BootlegProfession const kBootlegProfessions[] = {
    { SKILL_FIRST_AID,      "First Aid",      { 3274,  7924,  10846, 27028, 45542 } },
    { SKILL_BLACKSMITHING,  "Blacksmithing",  { 3100,  3538,  9785,  29844, 51300 } },
    { SKILL_LEATHERWORKING, "Leatherworking", { 3104,  3811,  10662, 32549, 51302 } },
    { SKILL_ALCHEMY,        "Alchemy",        { 3101,  3464,  11611, 28596, 51304 } },
    { SKILL_HERBALISM,      "Herbalism",      { 2368,  3570,  11993, 28695, 50300 } },
    { SKILL_COOKING,        "Cooking",        { 3102,  3413,  18260, 33359, 51296 } },
    { SKILL_MINING,         "Mining",         { 2576,  3564,  10248, 29354, 50310 } },
    { SKILL_TAILORING,      "Tailoring",      { 3909,  3910,  12180, 26790, 51309 } },
    { SKILL_ENGINEERING,    "Engineering",    { 4037,  4038,  12656, 30350, 51306 } },
    { SKILL_ENCHANTING,     "Enchanting",     { 7412,  7413,  13920, 28029, 51313 } },
    { SKILL_FISHING,        "Fishing",        { 7731,  7732,  18248, 33095, 51294 } },
    { SKILL_SKINNING,       "Skinning",       { 8617,  8618,  10768, 32678, 50305 } },
    { SKILL_INSCRIPTION,    "Inscription",    { 45358, 45359, 45360, 45361, 45363 } },
    { SKILL_JEWELCRAFTING,  "Jewelcrafting",  { 25230, 28894, 28895, 28897, 51311 } },
};

std::size_t const kBootlegProfessionCount = sizeof(kBootlegProfessions) / sizeof(kBootlegProfessions[0]);

BootlegProfessionTierDef const kBootlegTierLadder[] = {
    { 2, 150, BOOTLEG_TIER_JOURNEYMAN },
    { 3, 225, BOOTLEG_TIER_EXPERT },
    { 4, 300, BOOTLEG_TIER_ARTISAN },
    { 5, 375, BOOTLEG_TIER_MASTER },
    { 6, 450, BOOTLEG_TIER_GRAND_MASTER },
};

std::size_t const kBootlegTierLadderCount = sizeof(kBootlegTierLadder) / sizeof(kBootlegTierLadder[0]);

bool BootlegFindNextProfessionTier(uint32 currentMax, BootlegNextProfessionTier* out)
{
    if (!out)
    {
        return false;
    }

    BootlegProfessionsConfig const& config = BootlegConfig::instance().Professions();

    for (std::size_t i = 0; i < kBootlegTierLadderCount; ++i)
    {
        BootlegProfessionTierDef const& tierDef = kBootlegTierLadder[i];

        if (tierDef.maxSkill <= currentMax)
        {
            continue;
        }

        // Only the immediate next tier is purchasable; disabled tiers block progression.
        BootlegTierConfig const& tierConfig = config.tiers[tierDef.configTier];
        if (!tierConfig.enabled)
        {
            return false;
        }

        out->tierDef = &tierDef;
        out->tierConfig = &tierConfig;
        return true;
    }

    return false;
}
