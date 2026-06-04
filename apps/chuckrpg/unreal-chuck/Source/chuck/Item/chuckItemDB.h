#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "chuckItemTypes.h"
#include "chuckItemDB.generated.h"

UCLASS()
class UchuckItemDB : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	const FchuckItemDef* LookupByKey(int32 Key) const;
	const FchuckItemDef* LookupByRef(FName Ref) const;

	const TArray<FchuckItemDef>& GetAll() const { return ByKey; }
	int32 Num() const { return Items.Num(); }
	int32 MaxKey() const { return ByKey.Num() - 1; }

private:
	void LoadFromJson(const FString& JsonText);

	UPROPERTY() TArray<FchuckItemDef> Items;
	UPROPERTY() TArray<FchuckItemDef> ByKey;

	TMap<FName, int32> RefToKey;
};
