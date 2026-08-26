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
    constexpr uint32 GOSSIP_TEXT_HANGAR = 90040;
    constexpr uint32 GOSSIP_TEXT_BRIEFING = 90041;
    constexpr uint32 GOSSIP_TEXT_NO_SQUADRON = 90042;

    constexpr uint32 GOSSIP_ACTION_LAUNCH = 1;
    constexpr uint32 GOSSIP_ACTION_BRIEFING = 2;
    constexpr uint32 GOSSIP_ACTION_BACK = 3;
    constexpr uint32 GOSSIP_ACTION_RECALL = 4;

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
            return "is dead, and I do not strap corpses in";

        if (pilot->IsInCombat())
            return "is still fighting, and I am not fuelling a plane mid-brawl";

        if (pilot->GetVehicle())
            return "is already sitting in something with wheels";

        if (pilot->IsMounted())
            return "needs to get off that animal first";

        if (pilot->IsInFlight())
            return "is on a gryphon, and I do not compete with the flight masters";

        if (pilot->IsBeingTeleported())
            return "is halfway to somewhere else";

        if (pilot->IsInDisallowedMountForm())
            return "is wearing the wrong shape for a cockpit";

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

    std::vector<Player*> Squad(Player* player)
    {
        std::vector<Player*> squad;

        Group* group = player->GetGroup();
        if (!group)
        {
            squad.push_back(player);
            return squad;
        }

        for (GroupReference* itr = group->GetFirstMember(); itr != nullptr; itr = itr->next())
            if (Player* member = itr->GetSource())
                squad.push_back(member);

        return squad;
    }

    Creature* PilotedPlane(Player* player)
    {
        Unit* base = player->GetVehicleBase();
        if (!base)
            return nullptr;

        Creature* plane = base->ToCreature();
        if (!plane || plane->GetEntry() != PlaneEntry())
            return nullptr;

        return plane;
    }

    bool SquadIsFlying(Player* player)
    {
        for (Player* member : Squad(player))
            if (PilotedPlane(member))
                return true;

        return false;
    }

    std::vector<Player*> Roster(Player* leader, Creature* npc, std::string& problem)
    {
        std::vector<Player*> pilots;

        Group* group = leader->GetGroup();
        if (!group)
        {
            problem = "One pilot is not a squadron. Bring a crew and come back.";
            return pilots;
        }

        uint32 required = SquadronSize();
        if (group->GetMembersCount() != required)
        {
            problem = Acore::StringFormat(
                "I have {} airworthy planes in that hangar. Not {}. Bring me exactly {} pilots.",
                required, group->GetMembersCount(), required);
            return pilots;
        }

        if (LeaderOnly() && group->GetLeaderGUID() != leader->GetGUID())
        {
            problem = "I deal with whoever is leading. Go and fetch them.";
            return pilots;
        }

        float range = MaxRange();

        for (GroupReference* itr = group->GetFirstMember(); itr != nullptr; itr = itr->next())
        {
            Player* pilot = itr->GetSource();
            if (!pilot)
            {
                problem = "One of your crew is not here. I do not fly short-handed.";
                pilots.clear();
                return pilots;
            }

            if (pilot->GetMapId() != npc->GetMapId() || !pilot->IsWithinDist(npc, range))
            {
                problem = Acore::StringFormat("{} is nowhere near my dock. Walk them over.", pilot->GetName());
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

        SendHangar(player, creature);
        return true;
    }

    bool OnGossipSelect(Player* player, Creature* creature, uint32 /*sender*/, uint32 action) override
    {
        if (!Enabled() || !SessionAllowed(player))
        {
            CloseGossipMenuFor(player);
            return true;
        }

        if (action == GOSSIP_ACTION_BRIEFING)
        {
            ClearGossipMenuFor(player);
            AddGossipItemFor(player, GOSSIP_ICON_TALK, "Back to the hangar.", GOSSIP_SENDER_MAIN,
                             GOSSIP_ACTION_BACK);
            SendGossipMenuFor(player, GOSSIP_TEXT_BRIEFING, creature->GetGUID());
            return true;
        }

        if (action == GOSSIP_ACTION_BACK)
        {
            SendHangar(player, creature);
            return true;
        }

        CloseGossipMenuFor(player);

        if (action == GOSSIP_ACTION_RECALL)
        {
            Recall(player);
            return true;
        }

        if (action != GOSSIP_ACTION_LAUNCH)
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
                ChatHandler(player->GetSession()).PSendSysMessage("That is the trouble with salvage. Half of them will not start.");
                return true;
            }

            launched.push_back(plane);

            pilot->EnterVehicle(plane);
            if (pilot->GetVehicleBase() != plane)
            {
                Scrub(launched);
                ChatHandler(player->GetSession()).PSendSysMessage("{} cannot get the canopy open. Nobody flies until everyone does.", pilot->GetName());
                return true;
            }
        }

        for (std::size_t i = 0; i < pilots.size(); ++i)
        {
            SortieLog::instance().Record(sortieId, player->GetGUID().GetCounter(),
                                         pilots[i]->GetGUID().GetCounter(),
                                         launched[i]->GetGUID().GetCounter(), entry, duration);

            ChatHandler(pilots[i]->GetSession()).PSendSysMessage(
                "Sortie {} is airborne. The Cartel wants the plane back in {} minutes. It does not much care "
                "about you.", sortieId, duration / MINUTE);
        }

        LOG_INFO("module.dragonwars", "Sortie {} launched from Booty Bay with {} pilots, leader {}",
                 sortieId, pilots.size(), player->GetName());

        return true;
    }

private:
    static void SendHangar(Player* player, Creature* creature)
    {
        ClearGossipMenuFor(player);

        AddGossipItemFor(player, GOSSIP_ICON_BATTLE,
                         Acore::StringFormat("We are ready. Roll out {} planes.", SquadronSize()),
                         GOSSIP_SENDER_MAIN, GOSSIP_ACTION_LAUNCH);

        if (SquadIsFlying(player))
            AddGossipItemFor(player, GOSSIP_ICON_TAXI, "That is enough for today. Bring them home.",
                             GOSSIP_SENDER_MAIN, GOSSIP_ACTION_RECALL);

        AddGossipItemFor(player, GOSSIP_ICON_TALK, "Where did you get a hangar full of Wintergrasp planes?",
                         GOSSIP_SENDER_MAIN, GOSSIP_ACTION_BRIEFING);

        Group* group = player->GetGroup();
        bool ready = group && group->GetMembersCount() == SquadronSize();

        SendGossipMenuFor(player, ready ? GOSSIP_TEXT_HANGAR : GOSSIP_TEXT_NO_SQUADRON, creature->GetGUID());
    }

    static void Recall(Player* player)
    {
        uint32 returned = 0;

        for (Player* member : Squad(player))
        {
            Creature* plane = PilotedPlane(member);
            if (!plane)
                continue;

            if (Vehicle* vehicle = plane->GetVehicleKit())
                vehicle->RemoveAllPassengers();

            plane->DespawnOrUnsummon();
            ++returned;

            ChatHandler(member->GetSession()).PSendSysMessage("Sizzik waves you down. The sortie is over.");
        }

        ChatHandler(player->GetSession()).PSendSysMessage(
            "{} plane{} back in the hangar. Fewer than I lent out, but that is the business.",
            returned, returned == 1 ? "" : "s");
    }

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
