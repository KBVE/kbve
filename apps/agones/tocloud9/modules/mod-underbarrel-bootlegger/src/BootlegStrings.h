#ifndef BOOTLEG_STRINGS_H
#define BOOTLEG_STRINGS_H

// v1 user-facing strings (English). Greeting lives in npc_text SQL (§9.1).

static char const* const BOOTLEG_MSG_UTILITY_IN_PROGRESS =
    "Hold on, friend — you already got somethin' pending. Log out and finish that first.";

static char const* const BOOTLEG_MSG_UTILITY_DONE =
    "All set. Log out and back in to finish the change.";

static char const* const BOOTLEG_MENU_UTILITIES =
    "Character utilities";

static char const* const BOOTLEG_MENU_BACK =
    "Back";

static char const* const BOOTLEG_UTIL_NAME =
    "Change my name";

static char const* const BOOTLEG_UTIL_APPEARANCE =
    "Change my appearance";

static char const* const BOOTLEG_UTIL_RACE =
    "Change my race";

static char const* const BOOTLEG_UTIL_FACTION =
    "Change my faction";

static char const* const BOOTLEG_MENU_PROFESSIONS =
    "Professions";

// NOTE: ChatHandler::PSendSysMessage formats via Acore::StringFormat (fmtlib),
// so placeholders are {} — printf-style %u is NOT substituted.
static char const* const BOOTLEG_MSG_PROFESSION_ADVANCED =
    "Done and done — your skill cap is now {}. Keep it quiet.";

static char const* const BOOTLEG_MENU_INSTANCES =
    "Instance locks";

static char const* const BOOTLEG_INSTANCES_HEROIC =
    "Reset heroic dungeons";

static char const* const BOOTLEG_INSTANCES_RAID =
    "Reset raids";

static char const* const BOOTLEG_INSTANCES_JUST_ME =
    "Just me";

static char const* const BOOTLEG_INSTANCES_WHOLE_GROUP =
    "My whole group";

static char const* const BOOTLEG_MSG_INSTANCES_HEROIC_RESET =
    "Your heroic dungeon locks are cleared. Don't ask how.";

static char const* const BOOTLEG_MSG_INSTANCES_RAID_RESET =
    "Your raid locks are cleared. Keep it between us.";

static char const* const BOOTLEG_MSG_INSTANCES_GROUP_RESET =
    "Your group's eligible locks are cleared. Spread out the thanks.";

static char const* const BOOTLEG_CONFIRM_TRANSACTION =
    "You sure, friend? Fizzik don't do refunds. Hand over the coin and we're square.";

#endif
