#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVEQuestTypes.h"
#include "KBVEQuestDatabase.generated.h"

UCLASS()
class KBVEQUESTDB_API UKBVEQuestDatabase : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	bool LoadFromFile(const FString& FilePath);

	bool LoadFromJson(const FString& JsonText);

	const FKBVEQuestDef* FindByRef(FName Ref) const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	bool GetQuestByRef(FName Ref, FKBVEQuestDef& OutDef) const;

	const TArray<FKBVEQuestDef>& GetAll() const { return Quests; }

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	int32 Num() const { return Quests.Num(); }

private:
	UPROPERTY()
	TArray<FKBVEQuestDef> Quests;

	TMap<FName, int32> RefToIndex;
};
