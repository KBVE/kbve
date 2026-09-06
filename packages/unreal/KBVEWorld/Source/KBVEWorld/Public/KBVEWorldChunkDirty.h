#pragma once

#include "CoreMinimal.h"
#include "Mass/ExternalSubsystemTraits.h"
#include "MassSubsystemBase.h"

#include "KBVEWorldChunkDirty.generated.h"

UCLASS()
class KBVEWORLD_API UKBVEWorldChunkDirtySubsystem : public UMassSubsystemBase
{
	GENERATED_BODY()

public:
	void Mark(const FIntPoint& Chunk);
	bool Take(const FIntPoint& Chunk);
	void Forget(const FIntPoint& Chunk);

private:
	mutable FCriticalSection Guard;
	TSet<FIntPoint> Stale;
};

template <>
struct TMassExternalSubsystemTraits<UKBVEWorldChunkDirtySubsystem> final
{
	enum
	{
		GameThreadOnly = false,
		ThreadSafeWrite = true,
	};
};
