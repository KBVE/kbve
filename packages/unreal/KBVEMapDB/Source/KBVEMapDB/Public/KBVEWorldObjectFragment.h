#pragma once

#include "CoreMinimal.h"
#include "MassEntityTypes.h"
#include "KBVEWorldObjectFragment.generated.h"

USTRUCT()
struct KBVEMAPDB_API FKBVEWorldObjectFragment : public FMassFragment
{
	GENERATED_BODY()

	UPROPERTY()
	FName ObjectRef;

	UPROPERTY()
	FName Type;

	UPROPERTY()
	int32 RemainingAmount = 0;

	UPROPERTY()
	int32 HarvestTimeMs = 0;

	UPROPERTY()
	bool bInteractable = false;

	UPROPERTY()
	bool bDestructible = false;
};

USTRUCT()
struct KBVEMAPDB_API FKBVEWorldObjectTag : public FMassTag
{
	GENERATED_BODY()
};
