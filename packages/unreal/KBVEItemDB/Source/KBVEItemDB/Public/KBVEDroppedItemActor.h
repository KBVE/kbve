#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KBVEDroppedItemVisual.h"
#include "KBVEDroppedItemActor.generated.h"

class UMaterialBillboardComponent;
class UPointLightComponent;
class USphereComponent;

UCLASS()
class KBVEITEMDB_API AKBVEDroppedItemActor : public AActor
{
	GENERATED_BODY()

public:
	AKBVEDroppedItemActor();

	virtual void Tick(float DeltaSeconds) override;

	void Acquire(int32 InItemKey, int32 InCount, const FVector& Loc, const FKBVEDroppedItemVisual& Visual);
	void Release();

	int32 GetItemKey() const { return ItemKey; }
	int32 GetCount()   const { return Count; }
	bool  IsActive()   const { return bActive; }

protected:
	virtual void BeginPlay() override;

	UFUNCTION()
	void OnSphereBeginOverlap(UPrimitiveComponent* OverlappedComp, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	UPROPERTY(VisibleAnywhere, Category = "KBVE|Item")
	TObjectPtr<USphereComponent> SphereRoot;

	UPROPERTY(VisibleAnywhere, Category = "KBVE|Item")
	TObjectPtr<UMaterialBillboardComponent> IconBillboard;

	UPROPERTY(VisibleAnywhere, Category = "KBVE|Item")
	TObjectPtr<UMaterialBillboardComponent> HaloBillboard;

	UPROPERTY(VisibleAnywhere, Category = "KBVE|Item")
	TObjectPtr<UPointLightComponent> RarityLight;

	int32   ItemKey = 0;
	int32   Count   = 0;
	bool    bActive = false;
	bool    bHoming = false;
	float   BobPhase = 0.f;
	float   GraceTimer = 0.f;
	float   HomingTimer = 0.f;
	float   HomingDuration = 0.35f;
	FVector BaseLocation = FVector::ZeroVector;
	TWeakObjectPtr<AActor> HomingTarget;
};
