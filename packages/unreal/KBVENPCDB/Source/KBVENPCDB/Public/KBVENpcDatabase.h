#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVENpcTypes.h"
#include "KBVENpcDatabase.generated.h"

UCLASS()
class KBVENPCDB_API UKBVENpcDatabase : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "KBVE|NPC")
	bool LoadFromFile(const FString& FilePath);

	bool LoadFromJson(const FString& JsonText);

	UFUNCTION(BlueprintCallable, Category = "KBVE|NPC")
	bool GetNpcByRef(FName Ref, FKBVENpcDef& OutDef) const;

	const FKBVENpcDef* FindByRef(FName Ref) const;
	const TArray<FKBVENpcDef>& GetAll() const { return Npcs; }

	UFUNCTION(BlueprintCallable, Category = "KBVE|NPC")
	int32 Num() const { return Npcs.Num(); }

private:
	UPROPERTY()
	TArray<FKBVENpcDef> Npcs;

	TMap<FName, int32> RefToIndex;
};
