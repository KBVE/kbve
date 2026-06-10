#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KBVECombatTypes.h"
#include "KBVEThreatComponent.generated.h"

/**
 * Aggro table. Auto-binds to the owner's UKBVECombatComponent: each hit adds threat
 * for the instigator. AI reads GetTopThreatTarget to pick who to fight. Server-side.
 */
UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent))
class KBVECOMBAT_API UKBVEThreatComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKBVEThreatComponent();

	virtual void BeginPlay() override;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Combat")
	void AddThreat(AActor* Source, float Amount);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Combat")
	void ClearThreat(AActor* Source);

	UFUNCTION(BlueprintPure, Category = "KBVE|Combat")
	AActor* GetTopThreatTarget() const;

	/** Extra threat per point of damage taken. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat", meta = (ClampMin = "0.0"))
	float ThreatPerDamage = 1.0f;

private:
	UFUNCTION()
	void HandleDamaged(const FKBVEDamageEvent& DamageEvent, float NewHealth);

	UPROPERTY()
	TMap<TObjectPtr<AActor>, float> ThreatTable;
};
