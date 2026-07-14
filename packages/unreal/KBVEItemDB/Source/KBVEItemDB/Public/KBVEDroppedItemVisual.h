#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "KBVEDroppedItemVisual.generated.h"

class UMaterialInstanceDynamic;

USTRUCT(BlueprintType)
struct FKBVEDroppedItemVisual
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Item")
	TObjectPtr<UMaterialInstanceDynamic> IconMID = nullptr;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Item")
	TObjectPtr<UMaterialInstanceDynamic> HaloMID = nullptr;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Item")
	FLinearColor RarityColor = FLinearColor::White;
};

UINTERFACE(MinimalAPI)
class UKBVEDroppedItemVisualProvider : public UInterface
{
	GENERATED_BODY()
};

class KBVEITEMDB_API IKBVEDroppedItemVisualProvider
{
	GENERATED_BODY()

public:
	virtual bool GetDroppedItemVisual(int32 ItemKey, FKBVEDroppedItemVisual& OutVisual) const { return false; }
};
