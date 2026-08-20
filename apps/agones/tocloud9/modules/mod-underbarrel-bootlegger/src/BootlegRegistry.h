#ifndef BOOTLEG_REGISTRY_H
#define BOOTLEG_REGISTRY_H

#include "Common.h"

class BootlegService;
class Creature;
class Player;

class BootlegRegistry
{
public:
    static BootlegRegistry& instance();

    void AddRootEntries(Player* player) const;
    BootlegService* FindServiceForAction(uint32 action) const;
    bool HandleAction(Player* player, Creature* creature, uint32 action);

private:
    BootlegRegistry();

    BootlegService* _services[3];
};

#endif
