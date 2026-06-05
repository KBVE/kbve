#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "KBVEWebSurfaceSettings.generated.h"

/** Project-wide config for KBVE Web Surface plugin. */
UCLASS(config = Game, defaultconfig, meta = (DisplayName = "KBVE Web Surface"))
class KBVEWEBSURFACE_API UKBVEWebSurfaceSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, Config, Category = "Security")
	TArray<FString> AllowedURLPrefixes;

	UPROPERTY(EditAnywhere, Config, Category = "Security")
	TArray<FString> BlockedURLPrefixes;

	UPROPERTY(EditAnywhere, Config, Category = "Perf", meta = (ClampMin = "1", ClampMax = "120"))
	int32 DefaultFrameRate = 30;

	UPROPERTY(EditAnywhere, Config, Category = "Perf", meta = (ClampMin = "1"))
	int32 MaxConcurrentSurfaces = 8;

	bool IsURLAllowed(const FString& URL) const;
};
