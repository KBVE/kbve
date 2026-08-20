#include "BootlegService.h"

#include "BootlegActions.h"

bool BootlegService::OwnsAction(uint32 action) const
{
    uint32 const base = ActionBase();
    return action >= base && action < base + BOOTLEG_BLOCK_SIZE;
}
