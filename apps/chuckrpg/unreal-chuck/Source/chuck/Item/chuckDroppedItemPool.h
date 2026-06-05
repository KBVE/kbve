#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "chuckItemTypes.h"
#include "chuckDroppedItemPool.generated.h"

class AchuckDroppedItemActor;

UCLASS()
class UchuckDroppedItemPool : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
	virtual void OnWorldBeginPlay(UWorld& InWorld) override;
	virtual void Deinitialize() override;

	AchuckDroppedItemActor* SpawnDrop(int32 ItemKey, int32 Count, EchuckItemRarity Rarity, const FLinearColor& RarityColor, const FVector& Loc, class UTexture2D* IconTexture, class UTexture2D* HaloTexture, class UMaterialInterface* SharedMat);
	void ReleaseDrop(AchuckDroppedItemActor* Actor);

	const TArray<AchuckDroppedItemActor*>& GetActiveDrops() const { return ActiveDrops; }

private:
	UPROPERTY()
	TArray<TObjectPtr<AchuckDroppedItemActor>> AllActors;

	UPROPERTY()
	TArray<TObjectPtr<AchuckDroppedItemActor>> FreeActors;

	UPROPERTY()
	TArray<AchuckDroppedItemActor*> ActiveDrops;

	int32 InitialPoolSize = 64;
};
