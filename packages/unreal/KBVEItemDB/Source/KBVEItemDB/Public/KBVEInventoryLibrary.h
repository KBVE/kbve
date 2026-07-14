#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "KBVEInventoryTypes.h"
#include "KBVEInventoryLibrary.generated.h"

UCLASS()
class KBVEITEMDB_API UKBVEInventoryLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "KBVE|Inventory")
	static int32 TryAdd(UPARAM(ref) FKBVEInventoryBag& Bag, int32 ItemKey, int32 Count, int32 MaxStack, bool bStackable);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Inventory")
	static int32 CountItem(const FKBVEInventoryBag& Bag, int32 ItemKey);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Inventory")
	static int32 FindFirstSlot(const FKBVEInventoryBag& Bag, int32 ItemKey);
};
