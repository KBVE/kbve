#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldChunkActor.h"
#include "chuckTerrainChunk.generated.h"

UCLASS()
class AchuckTerrainChunk : public AKBVEWorldChunkActor
{
	GENERATED_BODY()

public:
	AchuckTerrainChunk();
	virtual float SampleHeight(float Wx, float Wy, uint32 InSeed) const override;
};
