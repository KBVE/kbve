#ifndef BOOTLEG_INSTANCE_RESET_SERVICE_H
#define BOOTLEG_INSTANCE_RESET_SERVICE_H

#include "BootlegService.h"

enum BootlegInstanceResetType : uint8
{
    BOOTLEG_INSTANCE_HEROIC = 0,
    BOOTLEG_INSTANCE_RAID = 1,
};

class InstanceResetService : public BootlegService
{
public:
    char const* Key() const override;
    uint32 ActionBase() const override;
    bool IsEnabled() const override;
    bool IsAvailable(Player* player) const override;
    void AddRootEntry(Player* player) const override;
    bool HandleAction(Player* player, Creature* creature, uint32 action) override;

private:
    static bool HasSavedInstances(Player* player, BootlegInstanceResetType type);
    static void ResetInstances(Player* player, BootlegInstanceResetType type);
    static bool IsTypeEnabled(BootlegInstanceResetType type);
    static uint32 GetTypeCostCopper(BootlegInstanceResetType type);
    static bool PlayerMatchesTypeSave(Player* player, BootlegInstanceResetType type);

    void ShowSubmenu(Player* player, Creature* creature) const;
    void ShowScopeSubmenu(Player* player, Creature* creature, BootlegInstanceResetType type) const;
    bool TryReset(Player* player, BootlegInstanceResetType type, bool groupScope);
};

#endif
