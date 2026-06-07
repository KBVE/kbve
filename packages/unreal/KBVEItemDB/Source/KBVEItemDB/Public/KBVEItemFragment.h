#pragma once

#include "CoreMinimal.h"
#include "MassEntityTypes.h"
#include "KBVEItemFragment.generated.h"

USTRUCT()
struct KBVEITEMDB_API FKBVEDroppedItemFragment : public FMassFragment
{
	GENERATED_BODY()

	UPROPERTY()
	int32 ItemKey = 0;

	UPROPERTY()
	int32 Count = 1;

	UPROPERTY()
	uint8 Rarity = 0;

	UPROPERTY()
	float SpawnTimeSec = 0.f;

	UPROPERTY()
	float LifetimeSec = 60.f;

	UPROPERTY()
	float MagnetRadius = 250.f;

	UPROPERTY()
	float PickupRadius = 65.f;
};

USTRUCT()
struct KBVEITEMDB_API FKBVEDroppedItemTag : public FMassTag
{
	GENERATED_BODY()
};
