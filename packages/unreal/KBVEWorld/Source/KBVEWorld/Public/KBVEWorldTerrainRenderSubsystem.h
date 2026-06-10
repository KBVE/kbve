#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "KBVEWorldChunkBlob.h"
#include "KBVEWorldTerrainRenderSubsystem.generated.h"

class AActor;
class UProceduralMeshComponent;
class UMaterialInterface;

USTRUCT()
struct FKBVEWorldTerrainPendingChunk
{
	GENERATED_BODY()

	FVector WorldOrigin = FVector::ZeroVector;
	FKBVEWorldChunkMesh Mesh;
};

USTRUCT()
struct FKBVEWorldTerrainRegion
{
	GENERATED_BODY()

	UPROPERTY(Transient)
	TObjectPtr<UProceduralMeshComponent> Section = nullptr;

	FVector Origin = FVector::ZeroVector;
	TSet<FIntPoint> Members;
	bool bDirty = false;
};

UCLASS()
class KBVEWORLD_API UKBVEWorldTerrainRenderSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
	virtual void Deinitialize() override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override { RETURN_QUICK_DECLARE_CYCLE_STAT(UKBVEWorldTerrainRenderSubsystem, STATGROUP_Tickables); }

	void RegisterChunkTerrain(FIntPoint ChunkCoord, const FVector& ChunkWorldOrigin, const FKBVEWorldChunkMesh& Mesh);
	void ReleaseChunkTerrain(FIntPoint ChunkCoord);

private:
	FIntPoint RegionKeyFor(FIntPoint ChunkCoord) const;
	void EnsureHost();
	UProceduralMeshComponent* EnsureRegionSection(FIntPoint RegionKey);
	void RebuildRegion(FIntPoint RegionKey);

	UPROPERTY(Transient)
	TObjectPtr<AActor> HostActor = nullptr;

	UPROPERTY(Transient)
	TObjectPtr<UMaterialInterface> GroundMaterial = nullptr;

	TMap<FIntPoint, FKBVEWorldTerrainPendingChunk> PendingChunks;

	UPROPERTY(Transient)
	TMap<FIntPoint, FKBVEWorldTerrainRegion> Regions;

	TSet<FIntPoint> DirtyRegions;
};
