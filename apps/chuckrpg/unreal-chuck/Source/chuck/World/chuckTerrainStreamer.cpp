#include "chuckTerrainStreamer.h"

#include "chuckSky.h"
#include "chuckTerrainChunk.h"
#include "chuckZoneRegistry.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerStart.h"
#include "GameFramework/Pawn.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/Paths.h"

bool UchuckTerrainStreamer::ShouldCreateSubsystem(UObject* Outer) const
{
	UWorld* W = Cast<UWorld>(Outer);
	const bool bGameWorld = W && W->IsGameWorld();
	UE_LOG(LogTemp, Display,
		TEXT("[chuck] TerrainStreamer ShouldCreateSubsystem world=%s isGame=%d wt=%d"),
		W ? *W->GetName() : TEXT("<null>"),
		bGameWorld ? 1 : 0,
		W ? (int32)W->WorldType : -1);
	return bGameWorld;
}

void UchuckTerrainStreamer::OnWorldBeginPlay(UWorld& InWorld)
{
	Super::OnWorldBeginPlay(InWorld);

	UE_LOG(LogTemp, Display, TEXT("[chuck] TerrainStreamer OnWorldBeginPlay world=%s"), *InWorld.GetName());

	const FString DbPath = FPaths::ProjectSavedDir() / TEXT("ProcWorld/terrain.db");
	Cache.Open(DbPath);

	if (ChunkPool.Num() > 0)
	{
		UE_LOG(LogTemp, Display,
			TEXT("[chuck] TerrainStreamer pool already primed (size=%d). Skipping spawn."),
			ChunkPool.Num());
	}
	ChunkPool.Reserve(PoolSize);
	FreeChunks.Reserve(PoolSize);

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Params.ObjectFlags |= RF_Transient;

	for (int32 i = ChunkPool.Num(); i < PoolSize; ++i)
	{
		AchuckTerrainChunk* C = InWorld.SpawnActor<AchuckTerrainChunk>(
			AchuckTerrainChunk::StaticClass(),
			FVector(0.f, 0.f, -200000.f),
			FRotator::ZeroRotator, Params);
		if (!C) continue;
		C->Release();
		ChunkPool.Add(C);
		FreeChunks.Add(C);
	}
	UE_LOG(LogTemp, Display, TEXT("[chuck] TerrainStreamer pool spawned %d/%d actors"), ChunkPool.Num(), PoolSize);

	// Spawn sky/atmosphere if level doesn't have one.
	bool bSkyPresent = false;
	for (TActorIterator<AchuckSky> It(&InWorld); It; ++It) { bSkyPresent = true; break; }
	if (!bSkyPresent)
	{
		FActorSpawnParameters SkyParams;
		SkyParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		SkyParams.ObjectFlags |= RF_Transient;
		InWorld.SpawnActor<AchuckSky>(AchuckSky::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, SkyParams);
	}

	// Anchor pre-warm to the player's actual spawn location. For an MMORPG, this
	// is whatever world coord we drop them at after login (PlayerStart, last
	// persisted save coord, party leader anchor, etc). Falls back to origin
	// when no PlayerStart is placed (early empty levels).
	FVector SpawnLoc = FVector::ZeroVector;
	bool bHaveAnchor = false;
	for (TActorIterator<APlayerStart> It(&InWorld); It; ++It)
	{
		if (APlayerStart* PS = *It)
		{
			SpawnLoc = PS->GetActorLocation();
			bHaveAnchor = true;
			break;
		}
	}

	const FIntPoint AnchorChunk = WorldToChunk(SpawnLoc);
	int32 BuiltCount = 0;
	for (int32 Dy = -ChunkRadius; Dy <= ChunkRadius; ++Dy)
	{
		for (int32 Dx = -ChunkRadius; Dx <= ChunkRadius; ++Dx)
		{
			EnsureChunk(FIntPoint(AnchorChunk.X + Dx, AnchorChunk.Y + Dy));
			++BuiltCount;
		}
	}
	UE_LOG(LogTemp, Display,
		TEXT("[chuck] TerrainStreamer pre-warmed %d chunks anchor=(%d,%d) anchorLoc=(%.0f,%.0f,%.0f) hadPlayerStart=%d pool=%d active=%d"),
		BuiltCount, AnchorChunk.X, AnchorChunk.Y,
		SpawnLoc.X, SpawnLoc.Y, SpawnLoc.Z,
		bHaveAnchor ? 1 : 0,
		ChunkPool.Num(), ActiveChunks.Num());
	TimeSinceStream = StreamInterval;
}

void UchuckTerrainStreamer::Deinitialize()
{
	for (AchuckTerrainChunk* C : ChunkPool)
	{
		if (IsValid(C)) C->Destroy();
	}
	ChunkPool.Reset();
	FreeChunks.Reset();
	ActiveChunks.Reset();
	Cache.Close();
	Super::Deinitialize();
}

TStatId UchuckTerrainStreamer::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(UchuckTerrainStreamer, STATGROUP_Tickables);
}

void UchuckTerrainStreamer::Tick(float DeltaSeconds)
{
	TimeSinceStream += DeltaSeconds;
	if (TimeSinceStream < StreamInterval) return;
	TimeSinceStream = 0.f;

	UWorld* W = GetWorld();
	if (!W) return;
	APlayerController* PC = UGameplayStatics::GetPlayerController(W, 0);
	APawn* Pawn = PC ? PC->GetPawn() : nullptr;
	if (!Pawn) return;

	const FIntPoint Center = WorldToChunk(Pawn->GetActorLocation());

	TSet<FIntPoint> Wanted;
	for (int32 Dy = -ChunkRadius; Dy <= ChunkRadius; ++Dy)
	{
		for (int32 Dx = -ChunkRadius; Dx <= ChunkRadius; ++Dx)
		{
			Wanted.Add(FIntPoint(Center.X + Dx, Center.Y + Dy));
		}
	}

	TArray<FIntPoint> ToRelease;
	for (auto& Pair : ActiveChunks)
	{
		if (!Wanted.Contains(Pair.Key)) ToRelease.Add(Pair.Key);
	}
	for (const FIntPoint& Key : ToRelease)
	{
		AchuckTerrainChunk* C = ActiveChunks[Key];
		ActiveChunks.Remove(Key);
		ReleaseChunk(C);
	}

	for (const FIntPoint& Want : Wanted)
	{
		if (!ActiveChunks.Contains(Want))
		{
			EnsureChunk(Want);
		}
	}
}

FIntPoint UchuckTerrainStreamer::WorldToChunk(const FVector& WorldLoc) const
{
	const float Extent = ChunkExtent();
	return FIntPoint(
		FMath::FloorToInt(WorldLoc.X / Extent),
		FMath::FloorToInt(WorldLoc.Y / Extent));
}

void UchuckTerrainStreamer::EnsureBuiltAround(const FVector2D& WorldXY)
{
	UWorld* W = GetWorld();
	if (!W) return;

	if (!Cache.IsOpen())
	{
		const FString DbPath = FPaths::ProjectSavedDir() / TEXT("ProcWorld/terrain.db");
		Cache.Open(DbPath);
	}

	if (ChunkPool.Num() == 0)
	{
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		Params.ObjectFlags |= RF_Transient;
		ChunkPool.Reserve(PoolSize);
		FreeChunks.Reserve(PoolSize);
		for (int32 i = 0; i < PoolSize; ++i)
		{
			AchuckTerrainChunk* C = W->SpawnActor<AchuckTerrainChunk>(
				AchuckTerrainChunk::StaticClass(),
				FVector(0.f, 0.f, -200000.f),
				FRotator::ZeroRotator, Params);
			if (!C) continue;
			C->Release();
			ChunkPool.Add(C);
			FreeChunks.Add(C);
		}
		UE_LOG(LogTemp, Display,
			TEXT("[chuck] TerrainStreamer eager pool spawned %d/%d (driven by EnsureBuiltAround)"),
			ChunkPool.Num(), PoolSize);
	}

	const FVector AnchorWorld(WorldXY.X, WorldXY.Y, 0.f);
	const FIntPoint AnchorChunk = WorldToChunk(AnchorWorld);
	int32 Built = 0;
	for (int32 Dy = -ChunkRadius; Dy <= ChunkRadius; ++Dy)
	{
		for (int32 Dx = -ChunkRadius; Dx <= ChunkRadius; ++Dx)
		{
			EnsureChunk(FIntPoint(AnchorChunk.X + Dx, AnchorChunk.Y + Dy));
			++Built;
		}
	}
	UE_LOG(LogTemp, Display,
		TEXT("[chuck] TerrainStreamer EnsureBuiltAround world=(%.0f,%.0f) chunk=(%d,%d) built=%d active=%d"),
		WorldXY.X, WorldXY.Y, AnchorChunk.X, AnchorChunk.Y, Built, ActiveChunks.Num());
}

void UchuckTerrainStreamer::EnsureChunk(const FIntPoint& C)
{
	AchuckTerrainChunk* Chunk = nullptr;

	// Prefer a free chunk that already has the matching mesh cached.
	for (int32 i = FreeChunks.Num() - 1; i >= 0 && !Chunk; --i)
	{
		AchuckTerrainChunk* Candidate = FreeChunks[i];
		if (IsValid(Candidate) && Candidate->HasMeshFor(C, Seed))
		{
			FreeChunks.RemoveAtSwap(i, EAllowShrinking::No);
			Chunk = Candidate;
		}
	}

	// Else evict the LRU (oldest LastUsedTick) free chunk.
	if (!Chunk)
	{
		int32 BestIdx = INDEX_NONE;
		uint64 BestTick = TNumericLimits<uint64>::Max();
		for (int32 i = 0; i < FreeChunks.Num(); ++i)
		{
			AchuckTerrainChunk* Candidate = FreeChunks[i];
			if (!IsValid(Candidate)) continue;
			if (Candidate->GetLastUsedTick() < BestTick)
			{
				BestTick = Candidate->GetLastUsedTick();
				BestIdx  = i;
			}
		}
		if (BestIdx != INDEX_NONE)
		{
			Chunk = FreeChunks[BestIdx];
			FreeChunks.RemoveAtSwap(BestIdx, EAllowShrinking::No);
		}
	}

	if (!Chunk)
	{
		UWorld* W = GetWorld();
		if (!W) return;
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		Params.ObjectFlags |= RF_Transient;
		Chunk = W->SpawnActor<AchuckTerrainChunk>(AchuckTerrainChunk::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, Params);
		if (!Chunk) return;
		ChunkPool.Add(Chunk);
	}

	bool bUsedExternalBlob = false;

	if (const FchuckStaticZone* Static = chuckZoneRegistry::FindContaining(C))
	{
		TArray<uint8> StaticBlob;
		if (chuckZoneRegistry::TryLoadStaticBlob(*Static, C, StaticBlob))
		{
			bUsedExternalBlob = Chunk->BuildFromBlob(C, Seed, StaticBlob, WaterZ);
		}
	}

	bool bHitDiskCache = false;
	if (!bUsedExternalBlob && Cache.IsOpen())
	{
		TArray<uint8> CachedBlob;
		if (Cache.Read(Seed, C, CachedBlob))
		{
			bUsedExternalBlob = Chunk->BuildFromBlob(C, Seed, CachedBlob, WaterZ);
			bHitDiskCache = bUsedExternalBlob;
		}
	}

	if (!bUsedExternalBlob)
	{
		Chunk->Build(C, Seed, CellsPerEdge, CellSize, WaterZ);
		if (Cache.IsOpen())
		{
			TArray<uint8> Bytes;
			Chunk->SerializeCurrentMesh(Bytes);
			if (Bytes.Num() > 0)
			{
				Cache.Write(Seed, C, Bytes);
			}
		}
	}

	UE_LOG(LogTemp, VeryVerbose,
		TEXT("[chuck] EnsureChunk coord=(%d,%d) seed=0x%08x diskHit=%d external=%d"),
		C.X, C.Y, Seed, bHitDiskCache ? 1 : 0, bUsedExternalBlob ? 1 : 0);

	Chunk->MarkUsed(++UseCounter);
	ActiveChunks.Add(C, Chunk);
}

void UchuckTerrainStreamer::ReleaseChunk(AchuckTerrainChunk* Chunk)
{
	if (!IsValid(Chunk)) return;
	Chunk->Release();
	FreeChunks.Add(Chunk);
}
