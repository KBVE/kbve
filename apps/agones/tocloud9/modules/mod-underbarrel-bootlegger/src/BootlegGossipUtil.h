#ifndef BOOTLEG_GOSSIP_UTIL_H
#define BOOTLEG_GOSSIP_UTIL_H

#include "Common.h"
#include <string>

class Player;

void BootlegNotifyInsufficientMoney(Player* player);

// Appends inline coin-icon price to label. Affordable: confirm popup + BoxMoney.
// Unaffordable: no popup; click reaches BootlegPurchase -> SendBuyError.
void BootlegAddPaidGossipItem(Player* player, uint8 icon, std::string const& label,
                              uint32 action, uint32 costCopper, char const* popupText);

#endif
