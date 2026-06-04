#pragma once

#include "CoreMinimal.h"
#include "MassEntityTypes.h"
#include "chuckStatsFragment.generated.h"

USTRUCT()
struct FchuckStatsFragment : public FMassFragment
{
	GENERATED_BODY()

	float Health = 100.f;
	float MaxHealth = 100.f;
	float HealthRegenPerSec = 5.f;

	float Mana = 100.f;
	float MaxMana = 100.f;
	float ManaRegenPerSec = 3.f;

	float Stamina = 100.f;
	float MaxStamina = 100.f;
	float StaminaRegenPerSec = 10.f;
	float StaminaSprintDrainPerSec = 20.f;

	bool bIsSprinting = false;
	bool bIsMoving = false;
};
