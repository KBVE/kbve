#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "chuckItemTypes.h"
#include "chuckDroppedItemActor.generated.h"

class UMaterialInterface;
class UMaterialBillboardComponent;
class UPointLightComponent;
class USphereComponent;
class UTexture2D;

UCLASS()
class AchuckDroppedItemActor : public AActor
{
	GENERATED_BODY()

public:
	AchuckDroppedItemActor();

	virtual void Tick(float DeltaSeconds) override;

	void Acquire(int32 InItemKey, int32 InCount, EchuckItemRarity InRarity, const FLinearColor& InRarityColor, const FVector& Loc, UTexture2D* IconTexture, UTexture2D* HaloTexture, UMaterialInterface* SharedMat);
	void Release();

	int32 GetItemKey() const { return ItemKey; }
	int32 GetCount()   const { return Count; }
	bool  IsActive()   const { return bActive; }

protected:
	virtual void BeginPlay() override;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USphereComponent> SphereRoot;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UMaterialBillboardComponent> IconBillboard;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UMaterialBillboardComponent> HaloBillboard;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UPointLightComponent> RarityLight;

	int32  ItemKey  = 0;
	int32  Count    = 0;
	EchuckItemRarity Rarity = EchuckItemRarity::Common;
	FLinearColor RarityColorCache = FLinearColor::White;
	bool   bActive  = false;
	float  BobPhase  = 0.f;
	FVector BaseLocation = FVector::ZeroVector;
};
