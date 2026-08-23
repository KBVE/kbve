#include "Config.h"
#include "GlobalScript.h"
#include "Log.h"
#include "ScriptMgr.h"
#include "SharedDefines.h"
#include "SpellAuraDefines.h"
#include "SpellInfo.h"

#include <sstream>
#include <string>
#include <unordered_set>

namespace
{
    uint32 g_cleared = 0;

    bool Enabled()
    {
        return sConfigMgr->GetOption<bool>("OldWorldFlying.Enable", true);
    }

    bool AllFlightSpells()
    {
        return sConfigMgr->GetOption<bool>("OldWorldFlying.AllFlightSpells", false);
    }

    bool IgnoreColdWeather()
    {
        return sConfigMgr->GetOption<bool>("OldWorldFlying.IgnoreColdWeatherFlying", true);
    }

    std::unordered_set<uint32> const& Allowed()
    {
        static std::unordered_set<uint32> spells = []
        {
            std::unordered_set<uint32> out;
            std::string raw = sConfigMgr->GetOption<std::string>("OldWorldFlying.Spells", "64681,64761");
            std::stringstream stream(raw);
            std::string token;

            while (std::getline(stream, token, ','))
            {
                try
                {
                    if (uint32 id = static_cast<uint32>(std::stoul(token)))
                        out.insert(id);
                }
                catch (std::exception const&)
                {
                    LOG_ERROR("module", "mod-old-world-flying: bad spell id '{}' in OldWorldFlying.Spells", token);
                }
            }

            return out;
        }();

        return spells;
    }

    bool GrantsFlight(SpellInfo const* spell)
    {
        return spell->HasAura(SPELL_AURA_MOUNTED) || spell->HasAura(SPELL_AURA_FLY);
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

        if (!GrantsFlight(spell))
            return;

        if (!AllFlightSpells() && !Allowed().count(spell->Id))
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
        if (!Enabled())
            return;

        LOG_INFO("module", "mod-old-world-flying: unrestricted {} spell(s), mode {}",
                 g_cleared, AllFlightSpells() ? "all-flight" : "allowlist");
    }
};

void AddOldWorldFlyingScripts()
{
    new OldWorldFlyingGlobal();
    new OldWorldFlyingWorld();
}
