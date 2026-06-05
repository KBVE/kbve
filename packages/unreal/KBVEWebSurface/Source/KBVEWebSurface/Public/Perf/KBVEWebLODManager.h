#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "KBVEWebLODManager.generated.h"

class UKBVEWebSurfaceComponent;

/** World subsystem applying frustum/distance LOD across active web surfaces. */
UCLASS()
class KBVEWEBSURFACE_API UKBVEWebLODManager : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

	void Register(UKBVEWebSurfaceComponent* Surface);
	void Unregister(UKBVEWebSurfaceComponent* Surface);

private:
	UPROPERTY(Transient)
	TArray<TWeakObjectPtr<UKBVEWebSurfaceComponent>> Surfaces;
};
