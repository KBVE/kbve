#ifndef BOOTLEG_UTILITIES_SERVICE_H
#define BOOTLEG_UTILITIES_SERVICE_H

#include "BootlegService.h"

#include "Player.h"

class UtilitiesService : public BootlegService
{
public:
    char const* Key() const override;
    uint32 ActionBase() const override;
    bool IsEnabled() const override;
    bool IsAvailable(Player* player) const override;
    void AddRootEntry(Player* player) const override;
    bool HandleAction(Player* player, Creature* creature, uint32 action) override;

private:
    static bool HasPendingUtilityChange(Player* player);
    void ShowSubmenu(Player* player, Creature* creature) const;
    bool TryPurchaseUtility(Player* player, AtLoginFlags flag, uint32 costCopper);
};

#endif
