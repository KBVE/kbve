#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "Engine/HitResult.h"
#include "KBVEWebInputRouter.generated.h"

/**
 * Maps line trace hits on a web surface into 2D widget-pixel coordinates.
 *
 * Prefer UKBVEWebInteractionComponent for flat surfaces. This helper remains
 * useful when raw UV math is needed for curved meshes; that path will fold
 * into UKBVEWebRenderSurfaceComponent in a future release.
 */
UCLASS(BlueprintType, meta = (DeprecatedNode, DeprecationMessage = "Use UKBVEWebInteractionComponent for flat surfaces."))
class KBVEWEBSURFACE_API UKBVEWebInputRouter : public UObject
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "KBVE|WebSurface|Input", meta = (DeprecatedFunction, DeprecationMessage = "Use UKBVEWebInteractionComponent for flat surfaces."))
	static FVector2D HitToWidgetCoord(const FHitResult& Hit, FIntPoint WidgetSize);

	UFUNCTION(BlueprintCallable, Category = "KBVE|WebSurface|Input", meta = (DeprecatedFunction, DeprecationMessage = "Use UKBVEWebInteractionComponent for flat surfaces."))
	static bool TraceForSurface(class AActor* Instigator, float MaxDistance, FHitResult& OutHit);
};
