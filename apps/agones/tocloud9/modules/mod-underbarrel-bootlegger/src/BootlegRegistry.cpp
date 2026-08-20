#include "BootlegRegistry.h"

#include "BootlegService.h"

#include "services/InstanceResetService.h"
#include "services/ProfessionsService.h"
#include "services/UtilitiesService.h"

namespace
{
UtilitiesService s_utilitiesService;
ProfessionsService s_professionsService;
InstanceResetService s_instanceResetService;
} // namespace

BootlegRegistry& BootlegRegistry::instance()
{
    static BootlegRegistry registry;
    return registry;
}

BootlegRegistry::BootlegRegistry()
{
    _services[0] = &s_utilitiesService;
    _services[1] = &s_professionsService;
    _services[2] = &s_instanceResetService;
}

void BootlegRegistry::AddRootEntries(Player* player) const
{
    for (BootlegService* service : _services)
    {
        if (service->IsEnabled() && service->IsAvailable(player))
        {
            service->AddRootEntry(player);
        }
    }
}

BootlegService* BootlegRegistry::FindServiceForAction(uint32 action) const
{
    for (BootlegService* service : _services)
    {
        if (service->OwnsAction(action))
        {
            return service;
        }
    }

    return nullptr;
}

bool BootlegRegistry::HandleAction(Player* player, Creature* creature, uint32 action)
{
    BootlegService* service = FindServiceForAction(action);
    if (!service)
    {
        return false;
    }

    return service->HandleAction(player, creature, action);
}
