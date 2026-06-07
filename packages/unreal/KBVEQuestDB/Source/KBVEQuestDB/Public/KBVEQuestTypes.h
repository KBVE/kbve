#pragma once

#include "CoreMinimal.h"
#include "KBVEQuestTypes.generated.h"

USTRUCT(BlueprintType)
struct FKBVEQuestObjective
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName Type;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> TargetRefs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 RequiredAmount = 1;
};

USTRUCT(BlueprintType)
struct FKBVEQuestItemReward
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName ItemRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 Amount = 1;
};

USTRUCT(BlueprintType)
struct FKBVEQuestRewards
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 Currency = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 Xp = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName UnlockRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FKBVEQuestItemReward> Items;
};

USTRUCT(BlueprintType)
struct FKBVEQuestDef
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName Ref;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Title;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName Category;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Icon;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bHidden = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bRepeatable = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 RecommendedLevel = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FKBVEQuestObjective> Objectives;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FKBVEQuestRewards Rewards;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName NextQuestRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> Tags;

	bool IsValid() const { return !Ref.IsNone(); }
};
