#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KBVEWebSurfaceActor.generated.h"

class UKBVEWebSurfaceComponent;

/** Drop-in actor pairing a flat web surface with a default scene root. */
UCLASS(BlueprintType, Blueprintable, DisplayName = "KBVE Web Surface Actor")
class KBVEWEBSURFACE_API AKBVEWebSurfaceActor : public AActor
{
	GENERATED_BODY()

public:
	AKBVEWebSurfaceActor();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE")
	TObjectPtr<UKBVEWebSurfaceComponent> WebSurface;
};
