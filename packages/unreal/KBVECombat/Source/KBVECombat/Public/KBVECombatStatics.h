#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "KBVECombatTypes.h"
#include "KBVECombatStatics.generated.h"

/**
 * Combat helpers that resolve a combatant on any actor — whether it implements
 * IKBVECombatant directly or carries a UKBVECombatComponent — so callers don't care
 * about the movement backend (Mover / CMC / Mass proxy).
 */
UCLASS()
class KBVECOMBAT_API UKBVECombatStatics : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/** Applies damage to Target via its combatant. Authority-only effect. Returns amount applied. */
	UFUNCTION(BlueprintCallable, Category = "KBVE|Combat")
	static float ApplyDamage(AActor* Target, const FKBVEDamageEvent& DamageEvent);

	UFUNCTION(BlueprintPure, Category = "KBVE|Combat")
	static bool IsAlive(const AActor* Target);

	UFUNCTION(BlueprintPure, Category = "KBVE|Combat")
	static int32 GetTeamId(const AActor* Target);

	UFUNCTION(BlueprintPure, Category = "KBVE|Combat")
	static bool AreHostile(const AActor* A, const AActor* B);

	static void ApplyDamageToEntity(const UObject* WorldContext, FMassEntityHandle Target, float Amount, EKBVEDamageElement Element, FMassEntityHandle Instigator);

	static bool IsEntityAlive(const UObject* WorldContext, FMassEntityHandle Target);

	static bool ApplyDotToEntity(const UObject* WorldContext, FMassEntityHandle Target, EKBVEDamageElement Element, float DamagePerSecond, float Duration, float Interval = 1.0f);

	/** Reduces Health on every FKBVEStatFragment Mass entity within Radius of Center. Returns entities hit. Authority-only. */
	static int32 DamageMassStatTargetsInSphere(const UObject* WorldContext, const FVector& Center, float Radius, float Amount);
};
