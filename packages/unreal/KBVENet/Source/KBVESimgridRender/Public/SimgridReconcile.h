#pragma once

#include "CoreMinimal.h"

struct FSimgridEntityDelta;

struct KBVESIMGRIDRENDER_API FSimgridReconcile
{
	static TSet<uint32> DespawnSet(const TSet<uint32>& Live, const TArray<FSimgridEntityDelta>& Keyframe);
	static TSet<uint32> DestroyedIds(const TArray<FSimgridEntityDelta>& Entities);
};
