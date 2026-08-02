#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVEProfessionTypes.h"
#include "KBVEProfessionDBDatabase.generated.h"

UCLASS()
class KBVEPROFESSIONDB_API UKBVEProfessionDBDatabase : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "KBVE|ProfessionDB")
	bool LoadFromFile(const FString& FilePath);

	bool LoadFromJson(const FString& JsonText);

	const FKBVEProfessionActionDef* LookupActionByRef(FName Ref) const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|ProfessionDB")
	bool GetActionByRef(FName Ref, FKBVEProfessionActionDef& OutDef) const;

	const TArray<FKBVEProfessionActionDef>& GetAllActions() const { return Actions; }

	UFUNCTION(BlueprintCallable, Category = "KBVE|ProfessionDB")
	int32 Num() const { return Actions.Num(); }

	UFUNCTION(BlueprintCallable, Category = "KBVE|ProfessionDB")
	TArray<FKBVEProfessionActionDef> GetActionsByProfession(FName ProfessionRef) const;

	const FKBVEProfessionDef* FindProfessionByRef(FName Ref) const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|ProfessionDB")
	bool GetProfessionByRef(FName Ref, FKBVEProfessionDef& OutDef) const;

	const TArray<FKBVEProfessionDef>& GetAllProfessions() const { return Professions; }

private:
	UPROPERTY()
	TArray<FKBVEProfessionActionDef> Actions;

	UPROPERTY()
	TArray<FKBVEProfessionDef> Professions;

	TMap<FName, int32> ActionRefToIndex;
	TMap<FName, int32> ProfessionRefToIndex;
};
