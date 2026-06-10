#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KBVECombatant.h"
#include "KBVECombatTypes.h"
#include "chuckCombatBridgeComponent.generated.h"

UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent))
class UchuckCombatBridgeComponent : public UActorComponent, public IKBVECombatant
{
	GENERATED_BODY()

public:
	virtual int32 GetTeamId_Implementation() const override { return TeamId; }
	virtual bool IsAlive_Implementation() const override { return !bDead; }
	virtual float ApplyDamage_Implementation(const FKBVEDamageEvent& DamageEvent) override;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Combat")
	void MarkDead() { bDead = true; }

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	int32 TeamId = 1;

private:
	bool bDead = false;
};
