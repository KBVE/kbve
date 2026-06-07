#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVEMapTypes.h"
#include "KBVEMapDatabase.generated.h"

UCLASS()
class KBVEMAPDB_API UKBVEMapDatabase : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Map")
	bool LoadFromFile(const FString& FilePath);

	bool LoadFromJson(const FString& JsonText);

	const FKBVEWorldObjectDef* FindObjectByRef(FName Ref) const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Map")
	bool GetObjectByRef(FName Ref, FKBVEWorldObjectDef& OutDef) const;

	const TArray<FKBVEWorldObjectDef>& GetAllObjects() const { return ObjectDefs; }

	UFUNCTION(BlueprintCallable, Category = "KBVE|Map")
	int32 NumObjects() const { return ObjectDefs.Num(); }

private:
	UPROPERTY()
	TArray<FKBVEWorldObjectDef> ObjectDefs;

	TMap<FName, int32> RefToIndex;
};
