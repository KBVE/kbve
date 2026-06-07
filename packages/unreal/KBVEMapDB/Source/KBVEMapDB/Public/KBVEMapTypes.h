#pragma once

#include "CoreMinimal.h"
#include "KBVEMapTypes.generated.h"

USTRUCT(BlueprintType)
struct FKBVEWorldObjectDef
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	FString Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	FName Ref;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	FString Name;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	FName Type;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	FName SubKind;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	FString Img;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	bool bInteractable = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	bool bDestructible = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	FName HarvestYield;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	int32 MaxAmount = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	int32 InitialAmount = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	int32 HarvestTimeMs = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	float SpawnWeight = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	int32 SpawnCount = 0;

	bool IsValid() const { return !Ref.IsNone(); }
};
