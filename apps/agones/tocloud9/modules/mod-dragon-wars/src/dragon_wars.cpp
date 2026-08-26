#include "Chat.h"
#include "Config.h"
#include "Creature.h"
#include "DatabaseEnv.h"
#include "Group.h"
#include "Log.h"
#include "Player.h"
#include "ScriptMgr.h"
#include "ScriptedGossip.h"
#include "StringFormat.h"
#include "TemporarySummon.h"
#include "Vehicle.h"
#include "WorldSession.h"

#include <ctime>
#include <string>
#include <vector>

namespace
{
    constexpr uint32 GOSSIP_TEXT_DRAGON_WARS = 90040;
    constexpr uint32 GOSSIP_ACTION_LAUNCH = 1;

    bool Enabled() { return sConfigMgr->GetOption<bool>("DragonWars.Enable", true); }
    uint32 SquadronSize() { return sConfigMgr->GetOption<uint32>("DragonWars.SquadronSize", 5); }
    uint32 PlaneEntry() { return sConfigMgr->GetOption<uint32>("DragonWars.PlaneEntry", 27838); }
    uint32 DurationSeconds() { return sConfigMgr->GetOption<uint32>("DragonWars.DurationSeconds", 900); }
    float MaxRange() { return sConfigMgr->GetOption<float>("DragonWars.MaxRange", 40.0f); }
    bool LeaderOnly() { return sConfigMgr->GetOption<bool>("DragonWars.LeaderOnly", true); }
    bool AllowBots() { return sConfigMgr->GetOption<bool>("DragonWars.AllowBots", true); }

    char const* PilotError(Player* pilot)
    {
        if (!pilot->IsAlive())
            return "is dead";

        if (pilot->IsInCombat())
            return "is in combat";

        if (pilot->GetVehicle())
            return "is already in a vehicle";

        if (pilot->IsMounted())
            return "is mounted";

        if (pilot->IsInFlight())
            return "is on a taxi";

        if (pilot->IsBeingTeleported())
            return "is teleporting";

        if (pilot->IsInDisallowedMountForm())
            return "is shapeshifted";

        return nullptr;
    }

    bool SessionAllowed(Player* player)
    {
        if (AllowBots())
            return true;

        WorldSession* session = player->GetSession();
        return session && !session->IsBot();
    }

    class SortieLog
    {
    public:
        static SortieLog& instance()
        {
            static SortieLog log;
            return log;
        }

        void Load()
        {
            _available = false;
            _nextId = 1;

            QueryResult probe = CharacterDatabase.Query(
                "SELECT COUNT(*) FROM `information_schema`.`TABLES` "
                "WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'mod_dragon_wars_sorties'");

            if (!probe || !(*probe)[0].Get<uint64>())
            {
                LOG_WARN("module.dragonwars",
                         "mod_dragon_wars_sorties is missing. Squadrons will still launch, but no sortie will be "
                         "logged. Apply the module's db-characters SQL to enable logging.");
                return;
            }

            _available = true;

            if (QueryResult result = CharacterDatabase.Query("SELECT MAX(`sortie_id`) FROM `mod_dragon_wars_sorties`"))
                if (!(*result)[0].IsNull())
                    _nextId = (*result)[0].Get<uint64>() + 1;
        }

        uint64 Open() { return _nextId++; }

        void Record(uint64 sortieId, ObjectGuid::LowType leader, ObjectGuid::LowType pilot,
                    ObjectGuid::LowType plane, uint32 entry, uint32 duration)
        {
            if (!_available)
                return;

            uint64 now = static_cast<uint64>(std::time(nullptr));

            CharacterDatabase.Execute(
                "INSERT INTO `mod_dragon_wars_sorties` "
                "(`sortie_id`, `leader_guid`, `pilot_guid`, `plane_guid`, `plane_entry`, `started_at`, `expires_at`) "
                "VALUES ({}, {}, {}, {}, {}, {}, {})",
                sortieId, leader, pilot, plane, entry, now, now + duration);
        }

    private:
        bool _available = false;
        uint64 _nextId = 1;
    };

    std::vector<Player*> Roster(Player* leader, Creature* npc, std::string& problem)
    {
        std::vector<Player*> pilots;

        Group* group = leader->GetGroup();
        if (!group)
        {
            problem = "You need a squadron. Form a group first.";
            return pilots;
        }

        uint32 required = SquadronSize();
        if (group->GetMembersCount() != required)
        {
            problem = Acore::StringFormat("A squadron is exactly {} pilots. Yours has {}.",
                                          required, group->GetMembersCount());
            return pilots;
        }

        if (LeaderOnly() && group->GetLeaderGUID() != leader->GetGUID())
        {
            problem = "Only the squadron leader can call for planes.";
            return pilots;
        }

        float range = MaxRange();

        for (GroupReference* itr = group->GetFirstMember(); itr != nullptr; itr = itr->next())
        {
            Player* pilot = itr->GetSource();
            if (!pilot)
            {
                problem = "One of your pilots is not online.";
                pilots.clear();
                return pilots;
            }

            if (pilot->GetMapId() != npc->GetMapId() || !pilot->IsWithinDist(npc, range))
            {
                problem = Acore::StringFormat("{} is too far from the airfield.", pilot->GetName());
                pilots.clear();
                return pilots;
            }

            if (char const* error = PilotError(pilot))
            {
                problem = Acore::StringFormat("{} {}.", pilot->GetName(), error);
                pilots.clear();
                return pilots;
            }

            pilots.push_back(pilot);
        }

        return pilots;
    }
}

class DragonWarsCreature : public CreatureScript
{
public:
    DragonWarsCreature() : CreatureScript("npc_dragon_wars") {}

    bool OnGossipHello(Player* player, Creature* creature) override
    {
        if (!Enabled() || !SessionAllowed(player))
        {
            CloseGossipMenuFor(player);
            return true;
        }

        ClearGossipMenuFor(player);

        AddGossipItemFor(player, GOSSIP_ICON_BATTLE,
                         Acore::StringFormat("Launch the squadron ({} planes)", SquadronSize()),
                         GOSSIP_SENDER_MAIN, GOSSIP_ACTION_LAUNCH);

        SendGossipMenuFor(player, GOSSIP_TEXT_DRAGON_WARS, creature->GetGUID());
        return true;
    }

    bool OnGossipSelect(Player* player, Creature* creature, uint32 /*sender*/, uint32 action) override
    {
        CloseGossipMenuFor(player);

        if (!Enabled() || !SessionAllowed(player) || action != GOSSIP_ACTION_LAUNCH)
            return true;

        std::string problem;
        std::vector<Player*> pilots = Roster(player, creature, problem);
        if (pilots.empty())
        {
            ChatHandler(player->GetSession()).PSendSysMessage("{}", problem);
            return true;
        }

        uint32 entry = PlaneEntry();
        uint32 duration = DurationSeconds();
        uint64 sortieId = SortieLog::instance().Open();

        std::vector<TempSummon*> launched;
        launched.reserve(pilots.size());

        for (Player* pilot : pilots)
        {
            TempSummon* plane = creature->SummonCreature(entry, *pilot, TEMPSUMMON_TIMED_DESPAWN,
                                                         duration * IN_MILLISECONDS);
            if (!plane)
            {
                Scrub(launched);
                ChatHandler(player->GetSession()).PSendSysMessage("The hangar could not roll out enough planes.");
                return true;
            }

            launched.push_back(plane);

            pilot->EnterVehicle(plane);
            if (pilot->GetVehicleBase() != plane)
            {
                Scrub(launched);
                ChatHandler(player->GetSession()).PSendSysMessage("{} could not climb into a cockpit.", pilot->GetName());
                return true;
            }
        }

        for (std::size_t i = 0; i < pilots.size(); ++i)
        {
            SortieLog::instance().Record(sortieId, player->GetGUID().GetCounter(),
                                         pilots[i]->GetGUID().GetCounter(),
                                         launched[i]->GetGUID().GetCounter(), entry, duration);

            ChatHandler(pilots[i]->GetSession()).PSendSysMessage(
                "Sortie {} is airborne. You have {} minutes.", sortieId, duration / MINUTE);
        }

        LOG_INFO("module.dragonwars", "Sortie {} launched from Booty Bay with {} pilots, leader {}",
                 sortieId, pilots.size(), player->GetName());

        return true;
    }

private:
    static void Scrub(std::vector<TempSummon*>& launched)
    {
        for (TempSummon* plane : launched)
        {
            if (Vehicle* vehicle = plane->GetVehicleKit())
                vehicle->RemoveAllPassengers();

            plane->DespawnOrUnsummon();
        }

        launched.clear();
    }
};

class DragonWarsWorld : public WorldScript
{
public:
    DragonWarsWorld() : WorldScript("world_dragon_wars") {}

    void OnAfterConfigLoad(bool /*reload*/) override
    {
        if (Enabled())
            SortieLog::instance().Load();
    }
};

void AddDragonWarsScripts()
{
    new DragonWarsCreature();
    new DragonWarsWorld();
}
