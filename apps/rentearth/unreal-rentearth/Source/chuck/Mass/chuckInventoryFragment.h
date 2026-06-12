#pragma once

#include "CoreMinimal.h"
#include "MassEntityTypes.h"
#include "chuckInventoryFragment.generated.h"

USTRUCT()
struct FchuckInventorySlotPOD
{
	GENERATED_BODY()

	int32 ItemKey = 0;
	int32 Count = 0;
	int32 Durability = 0;
	uint8 Flags = 0;
	int32 InstanceIdx = -1;
};

USTRUCT()
struct FchuckInventoryFragment : public FMassFragment
{
	GENERATED_BODY()

	static constexpr int32 BagCapacity    = 24;
	static constexpr int32 HotbarCapacity = 10;

	FchuckInventorySlotPOD Bag[BagCapacity];
	FchuckInventorySlotPOD Hotbar[HotbarCapacity];

	uint32 BagDirtyMask    = 0;
	uint32 HotbarDirtyMask = 0;
};

static_assert(std::is_trivially_copyable<FchuckInventoryFragment>::value,
	"FchuckInventoryFragment must stay trivially copyable for Mass");
