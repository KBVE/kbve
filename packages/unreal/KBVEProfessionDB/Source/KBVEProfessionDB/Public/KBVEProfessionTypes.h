#pragma once

#include "CoreMinimal.h"
#include "KBVEProfessionTypes.generated.h"

USTRUCT(BlueprintType)
struct FKBVEProfessionResource
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	FName ItemRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	FString ItemName;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	int32 Quantity = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	float Chance = 1.f;
};

USTRUCT(BlueprintType)
struct FKBVEProfessionActionDef
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	FName Ref;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	FName ProfessionRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	FString Name;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	int32 RequiredLevel = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	int32 XpReward = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	int32 DurationMs = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	int32 Key = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	FName FacilityRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	FName ResourceNodeRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	TArray<FName> ToolRefs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	TArray<FKBVEProfessionResource> Inputs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	TArray<FKBVEProfessionResource> Outputs;

	bool IsValid() const { return !Ref.IsNone(); }
};

USTRUCT(BlueprintType)
struct FKBVEProfessionDef
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	FName Ref;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	int32 Key = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	FString Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	FString Name;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	FString Category;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	TArray<FName> Tags;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	int32 MaxLevel = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|ProfessionDB")
	TArray<FName> ActionRefs;

	bool IsValid() const { return !Ref.IsNone(); }
};
