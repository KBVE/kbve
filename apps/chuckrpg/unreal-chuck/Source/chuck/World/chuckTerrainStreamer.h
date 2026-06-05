#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Tickable.h"
#include "chuckTerrainStreamer.generated.h"

class AchuckTerrainChunk;

UCLASS()
class UchuckTerrainStreamer : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
	virtual void OnWorldBeginPlay(UWorld& InWorld) override;
	virtual void Deinitialize() override;

	virtual TStatId GetStatId() const override;
	virtual void Tick(float DeltaSeconds) override;

	void SetSeed(uint32 InSeed) { Seed = InSeed; }
	uint32 GetSeed() const { return Seed; }

protected:
	float ChunkExtent() const { return CellsPerEdge * CellSize; }
	FIntPoint WorldToChunk(const FVector& WorldLoc) const;
	void EnsureChunk(const FIntPoint& C);
	void ReleaseChunk(AchuckTerrainChunk* Chunk);

	UPROPERTY()
	TArray<TObjectPtr<AchuckTerrainChunk>> ChunkPool;

	UPROPERTY()
	TArray<TObjectPtr<AchuckTerrainChunk>> FreeChunks;

	UPROPERTY()
	TMap<FIntPoint, TObjectPtr<AchuckTerrainChunk>> ActiveChunks;

	uint32 Seed         = 0xC1A55E5Au;
	int32  CellsPerEdge = 32;
	float  CellSize     = 200.f;
	int32  ChunkRadius  = 2;
	int32  PoolSize     = 36;
	float  WaterZ       = -120.f;
	float  StreamInterval = 0.5f;
	float  TimeSinceStream = 0.f;
};
