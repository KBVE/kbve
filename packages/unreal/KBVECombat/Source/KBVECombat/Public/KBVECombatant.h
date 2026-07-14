#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "KBVECombatTypes.h"
#include "KBVECombatant.generated.h"

UINTERFACE(MinimalAPI, BlueprintType)
class UKBVECombatant : public UInterface
{
	GENERATED_BODY()
};

/**
 * Anything that can take damage and belong to a team — Mover pawns, CMC characters,
 * Mass-backed NPC proxies. Lets combat code treat every fighter uniformly regardless
 * of movement backend. Typically forwarded to a UKBVECombatComponent.
 */
class IKBVECombatant
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintNativeEvent, Category = "KBVE|Combat")
	int32 GetTeamId() const;

	UFUNCTION(BlueprintNativeEvent, Category = "KBVE|Combat")
	bool IsAlive() const;

	/** Authority-side damage application. Returns the amount actually applied. */
	UFUNCTION(BlueprintNativeEvent, Category = "KBVE|Combat")
	float ApplyDamage(const FKBVEDamageEvent& DamageEvent);
};
