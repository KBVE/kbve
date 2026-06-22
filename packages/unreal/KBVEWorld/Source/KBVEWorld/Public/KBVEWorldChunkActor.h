#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KBVEWorldChunkBlob.h"
#include "KBVEWorldFoliageBucket.h"
#include "Mass/EntityHandle.h"
#include "KBVEWorldChunkActor.generated.h"

class UProceduralMeshComponent;
class UStaticMeshComponent;
class UMaterialInterface;
class UHierarchicalInstancedStaticMeshComponent;
class UFoliageType_InstancedStaticMesh;
class UStaticMesh;
class UMaterialParameterCollection;

UCLASS()
class KBVEWORLD_API AKBVEWorldChunkActor : public AActor
{
	GENERATED_BODY()

public:
	AKBVEWorldChunkActor();

	void Build(const FIntPoint& InCoord, uint32 InSeed, int32 InCellsPerEdge, float InCellSize, float InWaterZ);
	bool BuildFromBlob(const FIntPoint& InCoord, uint32 InSeed, const TArray<uint8>& Blob, float InWaterZ);
	void GenerateMeshData(FKBVEWorldChunkMesh& OutMesh) const;
	void SerializeCurrentMesh(TArray<uint8>& OutBytes) const;
	void Release();

	void SetImpostorVisible(bool bVisible);

	const FIntPoint& GetCoord() const { return Coord; }
	bool  IsActive() const { return bActive; }
	bool  HasMeshFor(const FIntPoint& InCoord, uint32 InSeed) const { return bMeshBuilt && Coord == InCoord && Seed == InSeed; }
	uint64 GetLastUsedTick() const { return LastUsedTick; }
	void   MarkUsed(uint64 TickNow) { LastUsedTick = TickNow; }

	virtual float SampleHeight(float Wx, float Wy, uint32 InSeed) const { return 0.f; }

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> Mesh;

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UStaticMeshComponent> Water;

	UPROPERTY(EditDefaultsOnly, Category = "KBVEWorld|Terrain")
	TObjectPtr<UMaterialInterface> GroundMaterial;

	UPROPERTY(EditDefaultsOnly, Category = "KBVEWorld|Terrain")
	TObjectPtr<UMaterialInterface> WaterMaterial;

	UPROPERTY(EditDefaultsOnly, Category = "KBVEWorld|Terrain")
	TObjectPtr<UMaterialInterface> GroundMaterialOverride;

	UPROPERTY(EditDefaultsOnly, Category = "KBVEWorld|Foliage|Grass")
	FKBVEWorldFoliageBucketConfig GrassBucket;

	UPROPERTY(EditDefaultsOnly, Category = "KBVEWorld|Foliage|Foliage")
	FKBVEWorldFoliageBucketConfig FoliageBucket;

	UPROPERTY(EditDefaultsOnly, Category = "KBVEWorld|Placement")
	float MaxSlope = 0.55f;

	UPROPERTY(EditDefaultsOnly, Category = "KBVEWorld|Placement")
	int32 BlockSize = 4;

	UPROPERTY(EditDefaultsOnly, Category = "KBVEWorld|Placement")
	int32 InstancesPerBlock = 64;

	UPROPERTY(EditDefaultsOnly, Category = "KBVEWorld|Placement", meta = (ClampMin = "1"))
	int32 PerChunkVariants = 12;

	UPROPERTY(EditDefaultsOnly, Category = "KBVEWorld|Biome", meta = (ClampMin = "1"))
	int32 NumGrassBiomes = 6;

	UPROPERTY(EditDefaultsOnly, Category = "KBVEWorld|Biome", meta = (ClampMin = "1"))
	int32 BiomeRegionChunks = 12;

	uint8 ChunkBiomeId = 0;

	UPROPERTY(EditDefaultsOnly, Category = "KBVEWorld|Terrain")
	float EdgeSkirtDepth = 200.f;

	UPROPERTY(EditDefaultsOnly, Category = "KBVEWorld|Shading")
	TSoftObjectPtr<UMaterialParameterCollection> GlobalShadingMPC;

	UPROPERTY()
	TArray<int32> ChunkVariantIndices;

	int32 PopulateToken = 0;

	UPROPERTY()
	TArray<TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> FoliageHISMs;

	UPROPERTY()
	TArray<TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> ImpostorHISMs;

	UPROPERTY()
	TArray<TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> GroundTintHISMs;

	bool bImpostorVisibleCached = false;

	UPROPERTY()
	TArray<TObjectPtr<UStaticMesh>> FoliageMeshes;

	UPROPERTY()
	TArray<TObjectPtr<UStaticMesh>> FoliageImpostorMeshes;

	UPROPERTY()
	TArray<TObjectPtr<UStaticMesh>> FoliageGroundTintMeshes;

	UPROPERTY()
	TArray<FKBVEWorldFoliageMeta> FoliageMetas;

	UPROPERTY()
	TArray<TObjectPtr<UFoliageType_InstancedStaticMesh>> FoliageTypes;

	FIntPoint Coord = FIntPoint::ZeroValue;
	uint32  Seed = 0;
	int32   CellsPerEdge = 32;
	float   CellSize     = 200.f;
	float   WaterZ       = -120.f;
	bool    bActive      = false;
	bool    bMeshBuilt   = false;
	uint64  LastUsedTick = 0;

	FKBVEWorldChunkMesh CachedMesh;

	FMassEntityHandle ChunkClusterEntity;

private:
	void RefreshChunkClusterHISMRefs();

	void UploadMesh(const FKBVEWorldChunkMesh& MeshData);
	void PositionWaterAndApplyMaterials(float ChunkSize);

	void LoadBucket(const FKBVEWorldFoliageBucketConfig& Cfg);
	void EnsureFoliageTypesLoaded();
	void EnsureHISMComponents();
	void PopulateFoliage();
	void ClearFoliage();
};
