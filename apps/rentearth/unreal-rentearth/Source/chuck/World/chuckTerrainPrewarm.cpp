#include "chuckTerrainPrewarm.h"

#include "Async/Async.h"
#include "Misc/Paths.h"
#include "Serialization/BufferArchive.h"
#include "Serialization/MemoryReader.h"
#include "chuckNoise.h"
#include "KBVEWorldChunkBlob.h"

FchuckTerrainPrewarm& FchuckTerrainPrewarm::Get()
{
	static FchuckTerrainPrewarm Instance;
	return Instance;
}

bool FchuckTerrainPrewarm::HasChunk(uint32 Seed, FIntPoint Coord)
{
	if (!bCacheOpen) return false;
	FScopeLock Lock(&CacheMutex);
	return Cache.HasKey(Seed, Coord);
}

FchuckTerrainPrewarm::FchuckTerrainPrewarm()
{
	const FString DbPath = FPaths::ProjectSavedDir() / TEXT("ProcWorld/terrain.db");
	bCacheOpen = Cache.Open(DbPath);
}

void FchuckTerrainPrewarm::Kick(uint32 Seed, FIntPoint Anchor, int32 Radius, int32 CellsPerEdge, float CellSize, bool bFlatWorld)
{
	if (!bCacheOpen) return;
	if (Radius <= 0)  return;

	const FKey Key{Seed, Anchor, Radius};
	{
		FScopeLock Lock(&KeyMutex);
		if (InFlightKeys.Contains(Key)) return;
		InFlightKeys.Add(Key);
	}

	TArray<FIntPoint> Coords;
	Coords.Reserve((2*Radius+1)*(2*Radius+1));
	for (int32 Dy = -Radius; Dy <= Radius; ++Dy)
	{
		for (int32 Dx = -Radius; Dx <= Radius; ++Dx)
		{
			Coords.Add(FIntPoint(Anchor.X + Dx, Anchor.Y + Dy));
		}
	}

	const int32 Total = Coords.Num();
	TotalChunks.Store(Total);
	CompletedChunks.Store(0);

	UE_LOG(LogTemp, Display,
		TEXT("[chuck] TerrainPrewarm kicked seed=0x%08x anchor=(%d,%d) radius=%d total=%d"),
		Seed, Anchor.X, Anchor.Y, Radius, Total);

	// Walk coords in a copy-by-value lambda so the worker thread doesn't
	// touch the caller's stack. ThreadPool fans out across hardware cores.
	Async(EAsyncExecution::ThreadPool, [this, Seed, CellsPerEdge, CellSize, bFlatWorld, Coords = MoveTemp(Coords), Key]()
	{
		for (const FIntPoint& Coord : Coords)
		{
			GenerateOne(Seed, Coord, CellsPerEdge, CellSize, bFlatWorld);
			CompletedChunks.IncrementExchange();
		}
		UE_LOG(LogTemp, Display,
			TEXT("[chuck] TerrainPrewarm completed seed=0x%08x anchor=(%d,%d) radius=%d completed=%d"),
			Seed, Key.Anchor.X, Key.Anchor.Y, Key.Radius, CompletedChunks.Load());

		FScopeLock Lock(&KeyMutex);
		InFlightKeys.RemoveAll([&Key](const FKey& K) { return K == Key; });
	});
}

void FchuckTerrainPrewarm::GenerateOne(uint32 Seed, FIntPoint Coord, int32 CellsPerEdge, float CellSize, bool bFlatWorld)
{
	// Skip cache hit so we don't redo prior session's work.
	{
		FScopeLock Lock(&CacheMutex);
		TArray<uint8> Probe;
		if (Cache.Read(Seed, Coord, Probe))
		{
			FKBVEWorldChunkMesh Existing;
			FMemoryReader Rd(Probe, true);
			Existing.Serialize(Rd);
			if (Existing.IsValidMesh()) return;
		}
	}

	FKBVEWorldChunkMesh Mesh;
	FKBVEWorldChunkMesh::Generate(Mesh, Coord, CellsPerEdge, CellSize, 200.f,
		[Seed, bFlatWorld](float Wx, float Wy)
		{
			return bFlatWorld ? 0.f : chuckNoise::Heightmap(Wx, Wy, Seed);
		});

	FBufferArchive Ar;
	Mesh.Serialize(Ar);
	if (Ar.Num() == 0) return;

	{
		FScopeLock Lock(&CacheMutex);
		Cache.Write(Seed, Coord, Ar);
	}
}
