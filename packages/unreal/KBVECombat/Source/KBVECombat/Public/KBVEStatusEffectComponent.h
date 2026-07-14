#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KBVECombatTypes.h"
#include "KBVEGameplayTypes.h"
#include "KBVEStatusEffectComponent.generated.h"

USTRUCT(BlueprintType)
struct FKBVEStatModifierSpec
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	FName StatId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	FName ModifierKey;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	float Magnitude = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	EKBVEStatOp Op = EKBVEStatOp::Additive;
};

USTRUCT(BlueprintType)
struct FKBVEStatusEffectDef
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	FName EffectId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat", meta = (ClampMin = "0.0"))
	float Duration = 5.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	TArray<FKBVEStatModifierSpec> Modifiers;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	float DotPerSecond = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	EKBVEDamageElement DotElement = EKBVEDamageElement::Poison;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat", meta = (ClampMin = "0.05"))
	float DotInterval = 1.0f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKBVEStatusChanged, FName, EffectId);

UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent))
class KBVECOMBAT_API UKBVEStatusEffectComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKBVEStatusEffectComponent();

	UFUNCTION(BlueprintCallable, Category = "KBVE|Combat")
	void ApplyStatus(const FKBVEStatusEffectDef& Effect);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Combat")
	void RemoveStatus(FName EffectId);

	UFUNCTION(BlueprintPure, Category = "KBVE|Combat")
	bool HasStatus(FName EffectId) const { return ActiveStatuses.Contains(EffectId); }

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Combat")
	FOnKBVEStatusChanged OnStatusApplied;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Combat")
	FOnKBVEStatusChanged OnStatusRemoved;

private:
	struct FActiveStatus
	{
		FKBVEStatusEffectDef Def;
		FTimerHandle ExpiryTimer;
		FTimerHandle DotTimer;
	};

	void TickDot(FName EffectId);
	static FName ResolveModifierKey(FName EffectId, const FKBVEStatModifierSpec& Spec);

	TMap<FName, FActiveStatus> ActiveStatuses;
};
