#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "Engine/HitResult.h"
#include "KBVEWebInputRouter.generated.h"

/** Maps line trace hits on a web surface into 2D widget-pixel coordinates. */
UCLASS(BlueprintType)
class KBVEWEBSURFACE_API UKBVEWebInputRouter : public UObject
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "KBVE|WebSurface|Input")
	static FVector2D HitToWidgetCoord(const FHitResult& Hit, FIntPoint WidgetSize);

	UFUNCTION(BlueprintCallable, Category = "KBVE|WebSurface|Input")
	static bool TraceForSurface(class AActor* Instigator, float MaxDistance, FHitResult& OutHit);
};
