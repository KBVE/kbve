#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVEItemTypes.h"
#include "KBVEItemDatabase.generated.h"

UCLASS()
class KBVEITEMDB_API UKBVEItemDatabase : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Item")
	bool LoadFromFile(const FString& FilePath);

	bool LoadFromJson(const FString& JsonText);

	const FKBVEItemDef* LookupByKey(int32 Key) const;
	const FKBVEItemDef* LookupByRef(FName Ref) const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Item")
	bool GetItemByKey(int32 Key, FKBVEItemDef& OutDef) const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Item")
	bool GetItemByRef(FName Ref, FKBVEItemDef& OutDef) const;

	const TArray<FKBVEItemDef>& GetAll() const { return Items; }

	UFUNCTION(BlueprintCallable, Category = "KBVE|Item")
	int32 Num() const { return Items.Num(); }

	UFUNCTION(BlueprintCallable, Category = "KBVE|Item")
	bool PersistCatalogToDb(const FString& DbPath) const;

private:
	UPROPERTY()
	TArray<FKBVEItemDef> Items;

	TMap<int32, int32> KeyToIndex;
	TMap<FName, int32>  RefToIndex;
};
