#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVEWebSurfacePool.generated.h"

class UKBVEWebSurfaceComponent;

/** Caps concurrent live web surfaces. Over-cap surfaces fall back to snapshot mode. */
UCLASS(Config = Game)
class KBVEWEBSURFACE_API UKBVEWebSurfacePool : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, Config, Category = "KBVE")
	int32 MaxConcurrent = 8;

	bool RequestLiveSlot(UKBVEWebSurfaceComponent* Surface);
	void Release(UKBVEWebSurfaceComponent* Surface);

private:
	UPROPERTY(Transient)
	TArray<TWeakObjectPtr<UKBVEWebSurfaceComponent>> Live;
};
