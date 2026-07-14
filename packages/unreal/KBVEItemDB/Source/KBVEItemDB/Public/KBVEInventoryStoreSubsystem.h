#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVEInventoryStore.h"
#include "KBVEInventoryTypes.h"
#include "KBVEInventoryStoreSubsystem.generated.h"

UCLASS()
class KBVEITEMDB_API UKBVEInventoryStoreSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Inventory")
	bool OpenAt(const FString& DbPath);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Inventory")
	bool SaveInventory(const FString& PlayerId, const FKBVEInventory& Inventory);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Inventory")
	bool LoadInventory(const FString& PlayerId, UPARAM(ref) FKBVEInventory& Inventory);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Inventory")
	int32 CountItem(const FString& PlayerId, int32 ItemKey);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Inventory")
	bool ClearPlayer(const FString& PlayerId);

private:
	FKBVEInventoryStore Store;
};
