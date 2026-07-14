#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KBVEWebBillboardActor.generated.h"

class UKBVEWebSurfaceComponent;
class UStaticMeshComponent;

/**
 * Outdoor banner. No interaction; cycles through a list of URLs on a timer.
 * Defaults to snapshot mode past 500 units and 10 fps redraw. Ideal for the
 * 88x31 partner banner pool sourced from packages/cdn/assets/banners/88x31/.
 */
UCLASS(BlueprintType, Blueprintable, DisplayName = "KBVE Web Billboard")
class KBVEWEBSURFACE_API AKBVEWebBillboardActor : public AActor
{
	GENERATED_BODY()

public:
	AKBVEWebBillboardActor();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE")
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE")
	TObjectPtr<UStaticMeshComponent> Frame;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE")
	TObjectPtr<UKBVEWebSurfaceComponent> Surface;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Billboard")
	TArray<FString> RotationURLs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Billboard", meta = (ClampMin = "1.0"))
	float RotationIntervalSeconds;

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	int32 CurrentIndex = 0;
	FTimerHandle RotationTimer;

	void AdvanceURL();
};
