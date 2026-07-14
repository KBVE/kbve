#pragma once

#include "CoreMinimal.h"
#include "Actors/KBVEWebTerminalActor.h"
#include "KBVEWebKioskActor.generated.h"

/**
 * Single-purpose info kiosk. Inherits from terminal but defaults to a tighter
 * perf profile: 15 fps cap, snapshot fallback at moderate distance, anonymous
 * auth. Use for patch notes, signage, hub kiosks where interaction is rare.
 */
UCLASS(BlueprintType, Blueprintable, DisplayName = "KBVE Web Kiosk")
class KBVEWEBSURFACE_API AKBVEWebKioskActor : public AKBVEWebTerminalActor
{
	GENERATED_BODY()

public:
	AKBVEWebKioskActor();
};
