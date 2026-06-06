#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KBVEWebHologramActor.generated.h"

class UKBVEWebRenderSurfaceComponent;

/**
 * Curved/holographic web surface. Wraps UKBVEWebRenderSurfaceComponent on a
 * mesh of the consumer's choosing. Set Mesh and Material in the details panel
 * to pick the visual shape (cylinder, hemisphere, custom).
 */
UCLASS(BlueprintType, Blueprintable, DisplayName = "KBVE Web Hologram")
class KBVEWEBSURFACE_API AKBVEWebHologramActor : public AActor
{
	GENERATED_BODY()

public:
	AKBVEWebHologramActor();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE")
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE")
	TObjectPtr<UKBVEWebRenderSurfaceComponent> Surface;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Hologram")
	FString InitialURL;

protected:
	virtual void BeginPlay() override;
};
