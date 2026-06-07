#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "KBVEDroppedItemVisual.h"
#include "KBVEDroppedItemPool.generated.h"

class AKBVEDroppedItemActor;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FKBVEOnItemPickedUp, AActor*, Picker, int32, ItemKey, int32, Count);

UCLASS()
class KBVEITEMDB_API UKBVEDroppedItemPool : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
	virtual void OnWorldBeginPlay(UWorld& InWorld) override;
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Item")
	void SetVisualProvider(const TScriptInterface<IKBVEDroppedItemVisualProvider>& InProvider);

	AKBVEDroppedItemActor* SpawnDrop(int32 ItemKey, int32 Count, const FVector& Loc);
	void ReleaseDrop(AKBVEDroppedItemActor* Actor);
	void HandlePickupComplete(AKBVEDroppedItemActor* Actor, AActor* Picker);

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Item")
	FKBVEOnItemPickedUp OnItemPickedUp;

	UPROPERTY(EditAnywhere, Category = "KBVE|Item")
	int32 InitialPoolSize = 64;

private:
	AKBVEDroppedItemActor* SpawnPooledActor(UWorld& World, const FVector& Loc);

	UPROPERTY()
	TArray<TObjectPtr<AKBVEDroppedItemActor>> AllActors;

	UPROPERTY()
	TArray<TObjectPtr<AKBVEDroppedItemActor>> FreeActors;

	UPROPERTY()
	TArray<TObjectPtr<AKBVEDroppedItemActor>> ActiveDrops;

	UPROPERTY()
	TScriptInterface<IKBVEDroppedItemVisualProvider> VisualProvider;
};
