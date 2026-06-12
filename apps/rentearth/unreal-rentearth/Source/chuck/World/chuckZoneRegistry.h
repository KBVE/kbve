#pragma once

#include "CoreMinimal.h"

struct FchuckStaticZone
{
	FName Id;
	FIntPoint OriginChunk = FIntPoint::ZeroValue;
	FIntPoint Extent      = FIntPoint(1, 1);
};

namespace chuckZoneRegistry
{
	const TArray<FchuckStaticZone>& All();
	const FchuckStaticZone* FindContaining(const FIntPoint& Coord);
	bool TryLoadStaticBlob(const FchuckStaticZone& Zone, const FIntPoint& Coord, TArray<uint8>& OutBlob);
}
