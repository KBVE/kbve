#pragma once

#include "CoreMinimal.h"
#include "KBVENpcTypes.generated.h"

USTRUCT(BlueprintType)
struct FKBVENpcStats
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	float HP = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	float MaxHP = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	float Attack = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	float Defense = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	float Speed = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	float Armor = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	float MP = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	float MaxMP = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	float EP = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	float MaxEP = 0.f;
};

USTRUCT(BlueprintType)
struct FKBVENpcDef
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	FString Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	FName Ref;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	FString Name;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	int32 Level = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	int32 TypeFlags = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	FName Family;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	FName FactionId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	FKBVENpcStats Stats;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	TArray<FName> AbilityIds;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	TArray<FName> Tags;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	float AggroRange = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|NPC")
	bool bFirstStrike = false;

	bool IsValid() const { return !Ref.IsNone(); }
};
