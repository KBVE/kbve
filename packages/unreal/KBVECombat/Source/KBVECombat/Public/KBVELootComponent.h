#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KBVECombatTypes.h"
#include "KBVELootComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnKBVELootDropped, const TArray<FKBVELootDrop>&, Drops, AActor*, Killer);

/**
 * Rolls a loot table when the owner dies. Auto-binds to the owner's
 * UKBVECombatComponent OnDeath (authority). Emits item refs + quantities via
 * OnLootDropped; the game spawns the actual pickups (KBVEItemDB) and awards XP.
 */
UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent))
class KBVECOMBAT_API UKBVELootComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKBVELootComponent();

	virtual void BeginPlay() override;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Combat")
	TArray<FKBVELootDrop> RollLoot() const;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	TArray<FKBVELootEntry> LootTable;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat", meta = (ClampMin = "0"))
	int32 XpReward = 0;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Combat")
	FOnKBVELootDropped OnLootDropped;

private:
	UFUNCTION()
	void HandleDeath(AActor* Killer);
};
