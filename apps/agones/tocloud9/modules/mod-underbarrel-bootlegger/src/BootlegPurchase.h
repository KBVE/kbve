#ifndef BOOTLEG_PURCHASE_H
#define BOOTLEG_PURCHASE_H

#include "Common.h"
#include <functional>

class Player;

bool BootlegPurchase(Player* player, uint32 costCopper,
                     std::function<bool()> const& stillEligible,
                     std::function<void()> const& grant);

#endif
