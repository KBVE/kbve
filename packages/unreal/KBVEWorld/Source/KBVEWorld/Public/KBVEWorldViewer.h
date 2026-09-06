#pragma once

#include "CoreMinimal.h"
#include "Mass/ExternalSubsystemTraits.h"
#include "MassSubsystemBase.h"

#include "KBVEWorldViewer.generated.h"

UCLASS()
class KBVEWORLD_API UKBVEWorldViewerSubsystem : public UMassTickableSubsystemBase
{
	GENERATED_BODY()

public:
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

	FVector GetViewLocation() const { return ViewLocation; }

	bool HasViewer() const { return bHasViewer; }

private:
	FVector ViewLocation = FVector::ZeroVector;
	bool bHasViewer = false;
};

template <>
struct TMassExternalSubsystemTraits<UKBVEWorldViewerSubsystem> final
{
	enum
	{
		GameThreadOnly = false,
		ThreadSafeWrite = false,
	};
};
