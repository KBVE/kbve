#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KBVECombatant.h"
#include "KBVECombatTypes.h"
#include "KBVECombatComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnKBVEDamaged, const FKBVEDamageEvent&, DamageEvent, float, NewHealth);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKBVEDeath, AActor*, Killer);

/**
 * Server-authoritative combat state for an actor. Resolves damage against the owner's
 * Health stat (IKBVEStatTarget), tracks team + dead state, and fires damaged/death
 * events. Implements IKBVECombatant so the owning actor can route combat through it.
 */
UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent))
class KBVECOMBAT_API UKBVECombatComponent : public UActorComponent, public IKBVECombatant
{
	GENERATED_BODY()

public:
	UKBVECombatComponent();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	// IKBVECombatant
	virtual int32 GetTeamId_Implementation() const override { return TeamId; }
	virtual bool IsAlive_Implementation() const override { return !bIsDead; }
	virtual float ApplyDamage_Implementation(const FKBVEDamageEvent& DamageEvent) override;

	UFUNCTION(BlueprintPure, Category = "KBVE|Combat")
	bool IsHostileTo(int32 OtherTeamId) const { return OtherTeamId != TeamId; }

	UFUNCTION(BlueprintPure, Category = "KBVE|Combat")
	float GetHealth() const;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Combat")
	FOnKBVEDamaged OnDamaged;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Combat")
	FOnKBVEDeath OnDeath;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	int32 TeamId = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	FName HealthStatId = FName(TEXT("Health"));

protected:
	UPROPERTY(ReplicatedUsing = OnRep_IsDead)
	bool bIsDead = false;

	UFUNCTION()
	void OnRep_IsDead();
};
