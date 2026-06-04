#pragma once

#include "CoreMinimal.h"
#include "chuckStats.generated.h"

USTRUCT(BlueprintType)
struct FchuckStatBlock
{
	GENERATED_BODY()

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Stats")
	float MaxHealth = 100.f;

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Stats")
	float Health = 100.f;

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Stats")
	float HealthRegenPerSec = 5.f;

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Stats")
	float MaxMana = 100.f;

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Stats")
	float Mana = 100.f;

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Stats")
	float ManaRegenPerSec = 3.f;

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Stats")
	float MaxStamina = 100.f;

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Stats")
	float Stamina = 100.f;

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Stats")
	float StaminaRegenPerSec = 10.f;

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Stats")
	float StaminaSprintDrainPerSec = 20.f;

	float HealthFraction()  const { return MaxHealth  > 0.f ? FMath::Clamp(Health  / MaxHealth,  0.f, 1.f) : 0.f; }
	float ManaFraction()    const { return MaxMana    > 0.f ? FMath::Clamp(Mana    / MaxMana,    0.f, 1.f) : 0.f; }
	float StaminaFraction() const { return MaxStamina > 0.f ? FMath::Clamp(Stamina / MaxStamina, 0.f, 1.f) : 0.f; }
};
