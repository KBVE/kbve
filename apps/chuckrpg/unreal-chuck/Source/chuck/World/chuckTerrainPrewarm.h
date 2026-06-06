#pragma once

#include "CoreMinimal.h"
#include "HAL/CriticalSection.h"
#include "Templates/Atomic.h"
#include "KBVEWorldChunkCache.h"

class UWorld;

class FchuckTerrainPrewarm
{
public:
	static FchuckTerrainPrewarm& Get();

	void Kick(uint32 Seed, FIntPoint Anchor, int32 Radius, int32 CellsPerEdge, float CellSize);

	int32 GetCompletedChunks() const { return CompletedChunks.Load(); }
	int32 GetTotalChunks()     const { return TotalChunks.Load(); }
	bool  IsRunning()          const { return TotalChunks.Load() > 0 && CompletedChunks.Load() < TotalChunks.Load(); }

	bool  HasChunk(uint32 Seed, FIntPoint Coord);

private:
	FchuckTerrainPrewarm();
	void GenerateOne(uint32 Seed, FIntPoint Coord, int32 CellsPerEdge, float CellSize);

	FKBVEWorldChunkCache Cache;
	FCriticalSection   CacheMutex;
	bool               bCacheOpen = false;

	TAtomic<int32> CompletedChunks{0};
	TAtomic<int32> TotalChunks{0};

	FCriticalSection KeyMutex;
	struct FKey { uint32 Seed; FIntPoint Anchor; int32 Radius; bool operator==(const FKey& O) const { return Seed==O.Seed && Anchor==O.Anchor && Radius==O.Radius; } };
	TArray<FKey> InFlightKeys;
};
