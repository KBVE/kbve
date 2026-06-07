#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KBVEGameplayTypes.h"
#include "KBVEEffectComponent.generated.h"

class IKBVEStatTarget;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKBVEOnEffectApplied, FName, SourceKey);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FKBVEOnStatusChanged, FName, Kind, int32, Stacks);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FKBVEOnCooldownStarted, FName, SourceKey, float, Duration);

UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent), DisplayName = "KBVE Effect Component")
class KBVEGAMEPLAY_API UKBVEEffectComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKBVEEffectComponent();

	UFUNCTION(BlueprintCallable, Category = "KBVE|Effect")
	void SetStatTarget(UObject* InTarget);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Effect")
	bool TryApplyEffect(const FKBVEEffectSpec& Spec);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Effect")
	bool IsOnCooldown(FName SourceKey) const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Effect")
	float GetCooldownRemaining(FName SourceKey) const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Effect")
	void ClearAllEffects();

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Effect")
	FKBVEOnEffectApplied OnEffectApplied;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Effect")
	FKBVEOnStatusChanged OnStatusChanged;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Effect")
	FKBVEOnCooldownStarted OnCooldownStarted;

protected:
	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	IKBVEStatTarget* ResolveTarget() const;
	void UpdateTickEnabled();

	UPROPERTY()
	TWeakObjectPtr<UObject> StatTargetObject;

	struct FActiveRegen
	{
		FName StatId;
		float RatePerSecond = 0.f;
		float Remaining     = 0.f;
	};
	struct FActiveBuff
	{
		FName StatId;
		FName Key;
		float Remaining = 0.f;
	};
	struct FActiveStatus
	{
		FName Kind;
		int32 Stacks    = 0;
		float Remaining = 0.f;
	};

	TArray<FActiveRegen>  ActiveRegens;
	TArray<FActiveBuff>   ActiveBuffs;
	TArray<FActiveStatus> ActiveStatuses;
	TMap<FName, float>    Cooldowns;
};
