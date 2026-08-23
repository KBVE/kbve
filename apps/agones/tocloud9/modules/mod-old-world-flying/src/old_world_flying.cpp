#include "Config.h"
#include "GlobalScript.h"
#include "Log.h"
#include "ScriptMgr.h"
#include "SharedDefines.h"
#include "SpellAuraDefines.h"
#include "SpellInfo.h"

namespace
{
    uint32 g_cleared = 0;

    bool Enabled()
    {
        return sConfigMgr->GetOption<bool>("OldWorldFlying.Enable", true);
    }

    bool IgnoreColdWeather()
    {
        return sConfigMgr->GetOption<bool>("OldWorldFlying.IgnoreColdWeatherFlying", true);
    }
}

class OldWorldFlyingGlobal : public GlobalScript
{
public:
    OldWorldFlyingGlobal() : GlobalScript("global_old_world_flying") {}

    void OnLoadSpellCustomAttr(SpellInfo* spell) override
    {
        if (!spell || !Enabled())
            return;

        if (!spell->HasAttribute(SPELL_ATTR4_ONLY_FLYING_AREAS))
            return;

        if (!spell->HasAura(SPELL_AURA_MOUNTED) && !spell->HasAura(SPELL_AURA_FLY))
            return;

        spell->AttributesEx4 &= ~SPELL_ATTR4_ONLY_FLYING_AREAS;

        if (IgnoreColdWeather())
            spell->AttributesEx7 |= SPELL_ATTR7_IGNORES_COLD_WEATHER_FLYING_REQUIREMENT;

        ++g_cleared;
    }
};

class OldWorldFlyingWorld : public WorldScript
{
public:
    OldWorldFlyingWorld() : WorldScript("world_old_world_flying") {}

    void OnStartup() override
    {
        if (Enabled())
            LOG_INFO("module", "mod-old-world-flying: unrestricted {} flying spells", g_cleared);
    }
};

void AddOldWorldFlyingScripts()
{
    new OldWorldFlyingGlobal();
    new OldWorldFlyingWorld();
}
