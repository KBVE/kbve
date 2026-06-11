#pragma once

#include "CoreMinimal.h"
#include "MassEntityTypes.h"
#include "KBVEMovementState.h"
#include "KBVEStatFragment.generated.h"

USTRUCT()
struct KBVEGAMEPLAY_API FKBVEStatFragment : public FMassFragment
{
	GENERATED_BODY()

	float Health = 100.f;
	float MaxHealth = 100.f;
	float HealthRegenPerSec = 5.f;

	float Mana = 100.f;
	float MaxMana = 100.f;
	float ManaRegenPerSec = 3.f;

	float Energy = 100.f;
	float MaxEnergy = 100.f;
	float EnergyRegenPerSec = 4.f;

	float Stamina = 100.f;
	float MaxStamina = 100.f;
	float StaminaRegenPerSec = 10.f;
	float StaminaSprintDrainPerSec = 20.f;
	float StaminaLowThreshold = 10.f;
	float StaminaLowRegenMultiplier = 0.5f;
	float StaminaEmptyPenaltySec = 2.5f;
	float StaminaRegenDelay = 0.f;

	EKBVEMovementState MoveState = EKBVEMovementState::None;
};
