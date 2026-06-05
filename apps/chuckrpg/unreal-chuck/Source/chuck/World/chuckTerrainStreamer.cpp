#include "chuckTerrainStreamer.h"

#include "chuckTerrainChunk.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/Pawn.h"
#include "Kismet/GameplayStatics.h"

bool UchuckTerrainStreamer::ShouldCreateSubsystem(UObject* Outer) const
{
	UWorld* W = Cast<UWorld>(Outer);
	return W && W->IsGameWorld();
}

void UchuckTerrainStreamer::OnWorldBeginPlay(UWorld& InWorld)
{
	Super::OnWorldBeginPlay(InWorld);

	ChunkPool.Reserve(PoolSize);
	FreeChunks.Reserve(PoolSize);

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Params.ObjectFlags |= RF_Transient;

	for (int32 i = 0; i < PoolSize; ++i)
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

void UchuckTerrainStreamer::EnsureChunk(const FIntPoint& C)
{
	AchuckTerrainChunk* Chunk = nullptr;
	while (FreeChunks.Num() > 0 && !Chunk)
	{
		Chunk = FreeChunks.Pop(EAllowShrinking::No);
		if (!IsValid(Chunk)) Chunk = nullptr;
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
	Chunk->Build(C, Seed, CellsPerEdge, CellSize, WaterZ);
	ActiveChunks.Add(C, Chunk);
}

void UchuckTerrainStreamer::ReleaseChunk(AchuckTerrainChunk* Chunk)
{
	if (!IsValid(Chunk)) return;
	Chunk->Release();
	FreeChunks.Add(Chunk);
}
