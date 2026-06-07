#pragma once

#include "CoreMinimal.h"
#include "MassEntityTypes.h"
#include "KBVENpcFragment.generated.h"

USTRUCT()
struct KBVENPCDB_API FKBVENpcFragment : public FMassFragment
{
	GENERATED_BODY()

	UPROPERTY()
	FName NpcRef;

	UPROPERTY()
	int32 Level = 1;

	UPROPERTY()
	FName FactionId;

	UPROPERTY()
	float AggroRange = 0.f;

	UPROPERTY()
	bool bFirstStrike = false;
};

USTRUCT()
struct KBVENPCDB_API FKBVENpcTag : public FMassTag
{
	GENERATED_BODY()
};
