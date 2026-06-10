#pragma once

#include "CoreMinimal.h"
#include "MassEntityTypes.h"
#include "KBVECombatMass.generated.h"

USTRUCT()
struct KBVECOMBAT_API FKBVECombatFragment : public FMassFragment
{
	GENERATED_BODY()

	UPROPERTY()
	float Health = 0.0f;

	UPROPERTY()
	float MaxHealth = 0.0f;

	UPROPERTY()
	int32 TeamId = 0;

	UPROPERTY()
	bool bDead = false;
};

USTRUCT()
struct KBVECOMBAT_API FKBVECombatTag : public FMassTag
{
	GENERATED_BODY()
};
