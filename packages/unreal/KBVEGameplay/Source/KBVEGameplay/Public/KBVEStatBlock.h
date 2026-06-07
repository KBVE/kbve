#pragma once

#include "CoreMinimal.h"
#include "KBVEStatBlock.generated.h"

USTRUCT(BlueprintType)
struct FKBVEStatBlock
{
	GENERATED_BODY()

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "KBVE|Stats")
	float MaxHealth = 100.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "KBVE|Stats")
	float Health = 100.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "KBVE|Stats")
	float HealthRegenPerSec = 5.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "KBVE|Stats")
	float MaxMana = 100.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "KBVE|Stats")
	float Mana = 100.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "KBVE|Stats")
	float ManaRegenPerSec = 3.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "KBVE|Stats")
	float MaxStamina = 100.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "KBVE|Stats")
	float Stamina = 100.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "KBVE|Stats")
	float StaminaRegenPerSec = 10.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "KBVE|Stats")
	float StaminaSprintDrainPerSec = 20.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "KBVE|Stats")
	float StaminaLowThreshold = 10.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "KBVE|Stats")
	float StaminaLowRegenMultiplier = 0.5f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "KBVE|Stats")
	float StaminaEmptyPenaltySec = 2.5f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "KBVE|Stats")
	float StaminaWarnThreshold = 20.f;

	float StaminaRegenDelay = 0.f;

	float HealthFraction()  const { return MaxHealth  > 0.f ? FMath::Clamp(Health  / MaxHealth,  0.f, 1.f) : 0.f; }
	float ManaFraction()    const { return MaxMana    > 0.f ? FMath::Clamp(Mana    / MaxMana,    0.f, 1.f) : 0.f; }
	float StaminaFraction() const { return MaxStamina > 0.f ? FMath::Clamp(Stamina / MaxStamina, 0.f, 1.f) : 0.f; }
};
