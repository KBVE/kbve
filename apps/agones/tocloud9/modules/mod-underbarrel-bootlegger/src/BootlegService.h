#ifndef BOOTLEG_SERVICE_H
#define BOOTLEG_SERVICE_H

#include "Common.h"

class Creature;
class Player;

class BootlegService
{
public:
    virtual ~BootlegService() = default;

    virtual char const* Key() const = 0;
    virtual uint32 ActionBase() const = 0;
    virtual bool IsEnabled() const = 0;
    virtual bool IsAvailable(Player* player) const = 0;

    virtual void AddRootEntry(Player* player) const = 0;

    virtual bool OwnsAction(uint32 action) const;

    // Return true to request a root-menu redraw (window stays open at root).
    // Services that close the gossip window (CloseGossipMenuFor) must return
    // false, or BootlegGossip will immediately re-send the menu and reopen it.
    virtual bool HandleAction(Player* player, Creature* creature, uint32 action) = 0;
};

#endif
