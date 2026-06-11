#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KBVECombatTypes.h"
#include "KBVEAbilityComponent.generated.h"

/** A simple attack/ability definition — windup → hit → cooldown. */
USTRUCT(BlueprintType)
struct FKBVEAbilityDef
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	FName AbilityId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	float Damage = 10.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	EKBVEDamageElement Element = EKBVEDamageElement::Physical;

	/** Forward reach to the hit point (cm). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat", meta = (ClampMin = "0.0"))
	float Range = 150.0f;

	/** >0 = AoE sphere radius at the hit point; 0 = single nearest target. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat", meta = (ClampMin = "0.0"))
	float Radius = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat", meta = (ClampMin = "0.0"))
	float WindupSeconds = 0.2f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat", meta = (ClampMin = "0.0"))
	float CooldownSeconds = 0.8f;

	/** Energy debited from the instigator on activate; 0 = free. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat", meta = (ClampMin = "0.0"))
	float EnergyCost = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	bool bFriendlyFire = false;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKBVEAbilityCommitted, FName, AbilityId);

/**
 * Server-authoritative attack/ability driver. Holds ability defs, tracks cooldowns,
 * runs a windup, then resolves a hit (single or AoE sphere) and applies damage to
 * hostile combatants via UKBVECombatStatics. One windup at a time (v1).
 */
UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent))
class KBVECOMBAT_API UKBVEAbilityComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKBVEAbilityComponent();

	/** Begin an ability by id (authority). False if unknown, on cooldown, or already winding up. */
	UFUNCTION(BlueprintCallable, Category = "KBVE|Combat")
	bool TryActivate(FName AbilityId);

	UFUNCTION(BlueprintPure, Category = "KBVE|Combat")
	bool IsOnCooldown(FName AbilityId) const;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	TArray<FKBVEAbilityDef> Abilities;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Combat")
	FOnKBVEAbilityCommitted OnAbilityCommitted;

private:
	const FKBVEAbilityDef* FindAbility(FName AbilityId) const;
	void Commit(FName AbilityId);

	TMap<FName, double> CooldownUntil;
	FName PendingAbility;
	FTimerHandle WindupTimer;
};
