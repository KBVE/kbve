#pragma once

#include "CoreMinimal.h"
#include "Components/WidgetInteractionComponent.h"
#include "KBVEWebInteractionComponent.generated.h"

/**
 * Pre-configured WidgetInteractionComponent for KBVE web surfaces.
 *
 * Attach to a player pawn / controller. Forwards mouse + key events to the
 * 3D widget under the trace cursor. Hover/click/scroll work for flat surfaces
 * via Unreal's built-in pipeline; no custom UV math required.
 */
UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent), DisplayName = "KBVE Web Interaction")
class KBVEWEBSURFACE_API UKBVEWebInteractionComponent : public UWidgetInteractionComponent
{
	GENERATED_BODY()

public:
	UKBVEWebInteractionComponent();
};
