#pragma once

#include "CoreMinimal.h"
#include "CombatCharacter.h"
#include "chuckCombatCharacter.generated.h"

class UchuckCombatBridgeComponent;

UCLASS()
class AchuckCombatCharacter : public ACombatCharacter
{
	GENERATED_BODY()

public:
	AchuckCombatCharacter();

	virtual void ApplyDamage(float Damage, AActor* DamageCauser, const FVector& DamageLocation, const FVector& DamageImpulse) override;
	virtual void HandleDeath() override;

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE|Combat")
	TObjectPtr<UchuckCombatBridgeComponent> CombatBridge;
};
