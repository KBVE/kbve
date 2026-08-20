#include "BootlegPurchase.h"

#include "BootlegGossipUtil.h"

#include "Player.h"

bool BootlegPurchase(Player* player, uint32 costCopper,
                     std::function<bool()> const& stillEligible,
                     std::function<void()> const& grant)
{
    if (!player)
    {
        return false;
    }

    if (!stillEligible())
    {
        return false;
    }

    if (!player->HasEnoughMoney(costCopper))
    {
        BootlegNotifyInsufficientMoney(player);
        return false;
    }

    player->ModifyMoney(-static_cast<int32>(costCopper));
    grant();
    return true;
}
