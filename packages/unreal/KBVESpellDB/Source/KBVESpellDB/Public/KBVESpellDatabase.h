#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Generated/KBVESpellDBProtoTypes.h"
#include "KBVESpellDatabase.generated.h"

UCLASS()
class KBVESPELLDB_API UKBVESpellDatabase : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "KBVE|SpellDB")
	bool LoadFromFile(const FString& FilePath);

	bool LoadFromJson(const FString& JsonText);

	const FKBVEGenSpell* LookupByRef(FName Ref) const;
	const FKBVEGenSpell* LookupByKey(int32 Key) const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|SpellDB")
	bool GetSpellByRef(FName Ref, FKBVEGenSpell& OutSpell) const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|SpellDB")
	bool GetSpellByKey(int32 Key, FKBVEGenSpell& OutSpell) const;

	const TArray<FKBVEGenSpell>& GetAll() const { return Spells; }

	UFUNCTION(BlueprintCallable, Category = "KBVE|SpellDB")
	int32 Num() const { return Spells.Num(); }

private:
	UPROPERTY()
	TArray<FKBVEGenSpell> Spells;

	TMap<FName, int32> RefToIndex;
	TMap<int32, int32> KeyToIndex;
};
