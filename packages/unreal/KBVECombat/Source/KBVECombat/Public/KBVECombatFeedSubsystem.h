#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "KBVECombatTypes.h"
#include "KBVECombatFeedSubsystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKBVECombatEvent, const FKBVECombatFeedEntry&, Entry);

/**
 * Per-world combat event stream. Combat components/abilities push entries (damage,
 * heal, death, ability); UI (damage numbers, combat log) subscribes to OnCombatEvent
 * or reads the recent ring. Presentation-side — broadcast locally where it's consumed.
 */
UCLASS()
class KBVECOMBAT_API UKBVECombatFeedSubsystem : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "KBVE|Combat")
	void PushEvent(const FKBVECombatFeedEntry& Entry);

	UFUNCTION(BlueprintPure, Category = "KBVE|Combat")
	const TArray<FKBVECombatFeedEntry>& GetRecent() const { return Recent; }

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Combat")
	FOnKBVECombatEvent OnCombatEvent;

	/** Convenience accessor; null if no world subsystem. */
	static UKBVECombatFeedSubsystem* Get(const UObject* WorldContext);

private:
	static constexpr int32 MaxEntries = 128;

	UPROPERTY()
	TArray<FKBVECombatFeedEntry> Recent;

	int32 Head = 0;
};
