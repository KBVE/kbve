#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldHeightfield.h"

namespace chuckNoise
{
	FORCEINLINE float Heightmap(float WorldX, float WorldY, uint32 Seed)
	{
		return FKBVEWorldHeightfield::HeightAt(static_cast<int32>(Seed), WorldX / 100.0f, WorldY / 100.0f);
	}
}
