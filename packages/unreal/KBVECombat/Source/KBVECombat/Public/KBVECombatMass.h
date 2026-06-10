#pragma once

#include "CoreMinimal.h"
#include "MassEntityTypes.h"
#include "KBVECombatTypes.h"
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
struct KBVECOMBAT_API FKBVECombatResistFragment : public FMassFragment
{
	GENERATED_BODY()

	UPROPERTY()
	TArray<FKBVEElementAffinity> Affinities;

	float GetMultiplier(EKBVEDamageElement Element) const
	{
		for (const FKBVEElementAffinity& Affinity : Affinities)
		{
			if (Affinity.Element == Element)
			{
				return Affinity.Multiplier;
			}
		}
		return 1.0f;
	}
};

USTRUCT()
struct KBVECOMBAT_API FKBVECombatTag : public FMassTag
{
	GENERATED_BODY()
};

USTRUCT()
struct KBVECOMBAT_API FKBVEActiveDot
{
	GENERATED_BODY()

	UPROPERTY()
	EKBVEDamageElement Element = EKBVEDamageElement::Poison;

	UPROPERTY()
	float DamagePerSecond = 0.0f;

	UPROPERTY()
	float TimeRemaining = 0.0f;

	UPROPERTY()
	float Interval = 1.0f;

	UPROPERTY()
	float Accumulator = 0.0f;
};

USTRUCT()
struct KBVECOMBAT_API FKBVECombatDotFragment : public FMassFragment
{
	GENERATED_BODY()

	UPROPERTY()
	TArray<FKBVEActiveDot> Dots;
};
