#pragma once

#include "CoreMinimal.h"
#include "MassEntityTypes.h"
#include "chuckDroppedItemFragment.generated.h"

USTRUCT()
struct FchuckDroppedItemFragment : public FMassFragment
{
	GENERATED_BODY()

	int32 ItemKey       = 0;
	int32 Count         = 0;
	uint8 Rarity        = 0;
	float SpawnTimeSec  = 0.f;
	float LifetimeSec   = 60.f;
	float MagnetRadius  = 250.f;
	float PickupRadius  = 65.f;
	uint16 PoolSlot     = 0;
};

USTRUCT()
struct FchuckDroppedItemTag : public FMassTag
{
	GENERATED_BODY()
};
