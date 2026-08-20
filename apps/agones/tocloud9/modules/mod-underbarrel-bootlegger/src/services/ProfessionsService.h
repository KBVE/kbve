#ifndef BOOTLEG_PROFESSIONS_SERVICE_H
#define BOOTLEG_PROFESSIONS_SERVICE_H

#include "BootlegProfessionData.h"
#include "BootlegService.h"

#include <cstddef>

class ProfessionsService : public BootlegService
{
public:
    char const* Key() const override;
    uint32 ActionBase() const override;
    bool IsEnabled() const override;
    bool IsAvailable(Player* player) const override;
    void AddRootEntry(Player* player) const override;
    bool HandleAction(Player* player, Creature* creature, uint32 action) override;

private:
    static bool CanAdvanceProfession(Player* player, BootlegProfession const& profession, BootlegNextProfessionTier const& nextTier);
    static bool TryGetNextTier(Player* player, BootlegProfession const& profession, BootlegNextProfessionTier* out);
    void ShowSubmenu(Player* player, Creature* creature) const;
    bool TryAdvanceProfession(Player* player, std::size_t professionIndex);
};

#endif
