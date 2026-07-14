#include "chuckZoneRegistry.h"

#include "HAL/PlatformFileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

namespace chuckZoneRegistry
{
	static TArray<FchuckStaticZone> BuildZones()
	{
		TArray<FchuckStaticZone> Out;
		// Authored zones: reserve world coords for fixed-layout cities/dungeons.
		// Loader looks for <ProjectContent>/Data/StaticZones/<Id>_<X>_<Y>.bin
		Out.Add({ TEXT("city.start"), FIntPoint(0, 0), FIntPoint(2, 2) });
		return Out;
	}

	const TArray<FchuckStaticZone>& All()
	{
		static const TArray<FchuckStaticZone> Zones = BuildZones();
		return Zones;
	}

	const FchuckStaticZone* FindContaining(const FIntPoint& Coord)
	{
		for (const FchuckStaticZone& Z : All())
		{
			const int32 MaxX = Z.OriginChunk.X + Z.Extent.X;
			const int32 MaxY = Z.OriginChunk.Y + Z.Extent.Y;
			if (Coord.X >= Z.OriginChunk.X && Coord.X < MaxX &&
			    Coord.Y >= Z.OriginChunk.Y && Coord.Y < MaxY)
			{
				return &Z;
			}
		}
		return nullptr;
	}

	bool TryLoadStaticBlob(const FchuckStaticZone& Zone, const FIntPoint& Coord, TArray<uint8>& OutBlob)
	{
		const FString Path = FPaths::ProjectContentDir() / TEXT("Data/StaticZones") /
			FString::Printf(TEXT("%s_%d_%d.bin"), *Zone.Id.ToString(), Coord.X, Coord.Y);
		if (!FPaths::FileExists(Path)) return false;
		return FFileHelper::LoadFileToArray(OutBlob, *Path);
	}
}
