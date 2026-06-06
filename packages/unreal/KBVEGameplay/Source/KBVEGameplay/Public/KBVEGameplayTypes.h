#pragma once

#include "CoreMinimal.h"
#include "KBVEGameplayTypes.generated.h"

UENUM(BlueprintType)
enum class EKBVEStatOp : uint8
{
	Additive,
	Multiplicative
};

USTRUCT(BlueprintType)
struct FKBVEStatRestore
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	FName StatId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	float Amount = 0.f;
};

USTRUCT(BlueprintType)
struct FKBVEStatRegen
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	FName StatId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	float RatePerSecond = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	float Duration = 0.f;
};

USTRUCT(BlueprintType)
struct FKBVEStatBuff
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	FName StatId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	FName Key;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	float Magnitude = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	EKBVEStatOp Op = EKBVEStatOp::Additive;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	float Duration = 0.f;
};

USTRUCT(BlueprintType)
struct FKBVEStatusEffect
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	FName Kind;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	int32 Stacks = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	float Duration = 0.f;
};

USTRUCT(BlueprintType)
struct FKBVEEffectSpec
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	FName SourceKey;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	FName AnimationRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	float Cooldown = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	TArray<FKBVEStatRestore> Restores;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	TArray<FKBVEStatRegen> Regens;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	TArray<FKBVEStatBuff> Buffs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Effect")
	TArray<FKBVEStatusEffect> Statuses;
};
