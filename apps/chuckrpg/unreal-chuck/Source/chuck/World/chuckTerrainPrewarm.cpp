#include "chuckTerrainPrewarm.h"

#include "Async/Async.h"
#include "Misc/Paths.h"
#include "Serialization/BufferArchive.h"
#include "chuckNoise.h"
#include "chuckTerrainBlob.h"
#include "KismetProceduralMeshLibrary.h"

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

void FchuckTerrainPrewarm::Kick(uint32 Seed, FIntPoint Anchor, int32 Radius, int32 CellsPerEdge, float CellSize)
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
	Async(EAsyncExecution::ThreadPool, [this, Seed, CellsPerEdge, CellSize, Coords = MoveTemp(Coords), Key]()
	{
		for (const FIntPoint& Coord : Coords)
		{
			GenerateOne(Seed, Coord, CellsPerEdge, CellSize);
			CompletedChunks.IncrementExchange();
		}
		UE_LOG(LogTemp, Display,
			TEXT("[chuck] TerrainPrewarm completed seed=0x%08x anchor=(%d,%d) radius=%d completed=%d"),
			Seed, Key.Anchor.X, Key.Anchor.Y, Key.Radius, CompletedChunks.Load());

		FScopeLock Lock(&KeyMutex);
		InFlightKeys.RemoveAll([&Key](const FKey& K) { return K == Key; });
	});
}

void FchuckTerrainPrewarm::GenerateOne(uint32 Seed, FIntPoint Coord, int32 CellsPerEdge, float CellSize)
{
	// Skip cache hit so we don't redo prior session's work.
	{
		FScopeLock Lock(&CacheMutex);
		TArray<uint8> Probe;
		if (Cache.Read(Seed, Coord, Probe)) return;
	}

	FchuckChunkMesh Mesh;
	Mesh.CellsPerEdge = CellsPerEdge;
	Mesh.CellSize     = CellSize;

	const int32 VertsPerEdge = CellsPerEdge + 1;
	const int32 VertCount    = VertsPerEdge * VertsPerEdge;
	Mesh.Vertices.SetNumUninitialized(VertCount);
	Mesh.Normals.Init(FVector::UpVector, VertCount);
	Mesh.UVs.SetNumUninitialized(VertCount);
	Mesh.Tangents.Init(FProcMeshTangent(1.f, 0.f, 0.f), VertCount);

	const FVector ChunkOrigin(Coord.X * CellsPerEdge * CellSize, Coord.Y * CellsPerEdge * CellSize, 0.f);
	for (int32 Y = 0; Y < VertsPerEdge; ++Y)
	{
		for (int32 X = 0; X < VertsPerEdge; ++X)
		{
			const int32 Idx = Y * VertsPerEdge + X;
			const float Lx = X * CellSize;
			const float Ly = Y * CellSize;
			const float Z  = chuckNoise::Heightmap(ChunkOrigin.X + Lx, ChunkOrigin.Y + Ly, Seed);
			Mesh.Vertices[Idx] = FVector(Lx, Ly, Z);
			Mesh.UVs[Idx]      = FVector2D((float)X / CellsPerEdge, (float)Y / CellsPerEdge);
		}
	}

	Mesh.Triangles.Reserve(CellsPerEdge * CellsPerEdge * 6);
	for (int32 Y = 0; Y < CellsPerEdge; ++Y)
	{
		for (int32 X = 0; X < CellsPerEdge; ++X)
		{
			const int32 TL = (Y + 0) * VertsPerEdge + (X + 0);
			const int32 TR = (Y + 0) * VertsPerEdge + (X + 1);
			const int32 BL = (Y + 1) * VertsPerEdge + (X + 0);
			const int32 BR = (Y + 1) * VertsPerEdge + (X + 1);
			Mesh.Triangles.Add(TL); Mesh.Triangles.Add(BL); Mesh.Triangles.Add(TR);
			Mesh.Triangles.Add(TR); Mesh.Triangles.Add(BL); Mesh.Triangles.Add(BR);
		}
	}

	// Tangents from the same util the gameplay path uses so the cached blob
	// is byte-identical to a live-built one.
	UKismetProceduralMeshLibrary::CalculateTangentsForMesh(
		Mesh.Vertices, Mesh.Triangles, Mesh.UVs, Mesh.Normals, Mesh.Tangents);

	FBufferArchive Ar;
	Mesh.Serialize(Ar);
	if (Ar.Num() == 0) return;

	{
		FScopeLock Lock(&CacheMutex);
		Cache.Write(Seed, Coord, Ar);
	}
}
