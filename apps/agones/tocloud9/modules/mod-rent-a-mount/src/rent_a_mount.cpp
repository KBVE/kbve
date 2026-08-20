#include "Chat.h"
#include "Config.h"
#include "Creature.h"
#include "DatabaseEnv.h"
#include "Log.h"
#include "Player.h"
#include "ScriptMgr.h"
#include "ScriptedGossip.h"
#include "SpellAuras.h"
#include "WorldSession.h"

#include <unordered_map>
#include <vector>

namespace
{
    constexpr uint32 GOSSIP_TEXT_RENT = 90030;

    struct RentOffer
    {
        uint32 id = 0;
        uint32 spellId = 0;
        uint32 priceCopper = 0;
        uint32 durationSeconds = 0;
        uint8 minLevel = 0;
        uint16 minRidingSkill = 0;
        std::string label;
    };

    class RentAMountStore
    {
    public:
        static RentAMountStore& instance()
        {
            static RentAMountStore store;
            return store;
        }

        void Load()
        {
            _offers.clear();

            QueryResult result = WorldDatabase.Query(
                "SELECT `id`, `team`, `spell`, `price_copper`, `duration_seconds`, `label`, "
                "`min_level`, `min_riding_skill` "
                "FROM `mod_rent_a_mount_offers` WHERE `enabled` = 1 ORDER BY `id`");

            if (!result)
            {
                LOG_INFO("module", "mod-rent-a-mount: no enabled offers found");
                return;
            }

            uint32 count = 0;
            do
            {
                Field* fields = result->Fetch();

                RentOffer offer;
                offer.id = fields[0].Get<uint32>();
                uint8 team = fields[1].Get<uint8>();
                offer.spellId = fields[2].Get<uint32>();
                offer.priceCopper = fields[3].Get<uint32>();
                offer.durationSeconds = fields[4].Get<uint32>();
                offer.label = fields[5].Get<std::string>();
                offer.minLevel = fields[6].Get<uint8>();
                offer.minRidingSkill = fields[7].Get<uint16>();

                if (!offer.spellId)
                    continue;

                if (!offer.priceCopper)
                    offer.priceCopper = sConfigMgr->GetOption<uint32>("RentAMount.DefaultPriceCopper", 50);

                if (!offer.durationSeconds)
                    offer.durationSeconds = sConfigMgr->GetOption<uint32>("RentAMount.DefaultDurationSeconds", 300);

                _offers[team].push_back(offer);
                ++count;
            } while (result->NextRow());

            LOG_INFO("module", "mod-rent-a-mount: loaded {} offers", count);
        }

        std::vector<RentOffer> For(TeamId team) const
        {
            std::vector<RentOffer> out;

            if (auto it = _offers.find(static_cast<uint8>(team)); it != _offers.end())
                out.insert(out.end(), it->second.begin(), it->second.end());

            if (auto it = _offers.find(TEAM_NEUTRAL); it != _offers.end())
                out.insert(out.end(), it->second.begin(), it->second.end());

            return out;
        }

        RentOffer const* Find(TeamId team, uint32 id) const
        {
            for (uint8 key : { static_cast<uint8>(team), static_cast<uint8>(TEAM_NEUTRAL) })
            {
                auto it = _offers.find(key);
                if (it == _offers.end())
                    continue;

                for (RentOffer const& offer : it->second)
                    if (offer.id == id)
                        return &offer;
            }

            return nullptr;
        }

    private:
        std::unordered_map<uint8, std::vector<RentOffer>> _offers;
    };

    bool Enabled()
    {
        return sConfigMgr->GetOption<bool>("RentAMount.Enable", true);
    }

    bool MeetsRequirements(Player* player, RentOffer const& offer)
    {
        if (offer.minLevel && player->GetLevel() < offer.minLevel)
            return false;

        if (offer.minRidingSkill && player->GetSkillValue(SKILL_RIDING) < offer.minRidingSkill)
            return false;

        return true;
    }

    bool SessionAllowed(Player* player)
    {
        if (sConfigMgr->GetOption<bool>("RentAMount.AllowBots", false))
            return true;

        WorldSession* session = player->GetSession();
        return session && !session->IsBot();
    }
}

class RentAMountCreature : public CreatureScript
{
public:
    RentAMountCreature() : CreatureScript("npc_rent_a_mount") {}

    bool OnGossipHello(Player* player, Creature* creature) override
    {
        if (!Enabled() || !SessionAllowed(player))
        {
            CloseGossipMenuFor(player);
            return true;
        }

        std::vector<RentOffer> offers = RentAMountStore::instance().For(player->GetTeamId());
        if (offers.empty())
        {
            CloseGossipMenuFor(player);
            return true;
        }

        ClearGossipMenuFor(player);

        uint32 shown = 0;
        for (RentOffer const& offer : offers)
        {
            if (!MeetsRequirements(player, offer))
                continue;

            AddGossipItemFor(player, GOSSIP_ICON_MONEY_BAG, offer.label, GOSSIP_SENDER_MAIN, offer.id);
            ++shown;
        }

        if (!shown)
        {
            ChatHandler(player->GetSession()).PSendSysMessage("You are not experienced enough to ride anything I have.");
            CloseGossipMenuFor(player);
            return true;
        }

        SendGossipMenuFor(player, GOSSIP_TEXT_RENT, creature->GetGUID());
        return true;
    }

    bool OnGossipSelect(Player* player, Creature* /*creature*/, uint32 /*sender*/, uint32 action) override
    {
        CloseGossipMenuFor(player);

        if (!Enabled() || !SessionAllowed(player))
            return true;

        RentOffer const* offer = RentAMountStore::instance().Find(player->GetTeamId(), action);
        if (!offer)
            return true;

        if (!MeetsRequirements(player, *offer))
        {
            ChatHandler(player->GetSession()).PSendSysMessage("You are not experienced enough to ride that.");
            return true;
        }

        if (player->IsInCombat() || player->isDead() || player->IsMounted())
        {
            ChatHandler(player->GetSession()).PSendSysMessage("You cannot rent a mount right now.");
            return true;
        }

        if (!player->HasEnoughMoney(static_cast<int32>(offer->priceCopper)))
        {
            ChatHandler(player->GetSession()).PSendSysMessage("You cannot afford that mount.");
            return true;
        }

        player->CastSpell(player, offer->spellId, true);

        Aura* aura = player->GetAura(offer->spellId);
        if (!aura)
        {
            ChatHandler(player->GetSession()).PSendSysMessage("The stablemaster could not ready that mount.");
            return true;
        }

        int32 durationMs = static_cast<int32>(offer->durationSeconds) * IN_MILLISECONDS;
        aura->SetMaxDuration(durationMs);
        aura->SetDuration(durationMs);

        player->ModifyMoney(-static_cast<int32>(offer->priceCopper));
        return true;
    }
};

class RentAMountWorld : public WorldScript
{
public:
    RentAMountWorld() : WorldScript("world_rent_a_mount") {}

    void OnAfterConfigLoad(bool /*reload*/) override
    {
        if (Enabled())
            RentAMountStore::instance().Load();
    }
};

void AddRentAMountScripts()
{
    new RentAMountCreature();
    new RentAMountWorld();
}
