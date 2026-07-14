#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldGrassData.generated.h"

// Tight 32-byte per-blade record. Everything CPU writes once at spawn; the
// material WPO reads tilt / curve / bend / color via custom data floats so
// the CPU never touches a blade after placement.
USTRUCT()
struct KBVEWORLD_API FKBVEGrassBladePacked
{
	GENERATED_BODY()

	UPROPERTY() FVector3f Position = FVector3f::ZeroVector;
	UPROPERTY() FVector2f Facing   = FVector2f(1.f, 0.f);

	UPROPERTY() uint16 TypeId  = 0;
	UPROPERTY() uint16 GroupId = 0;

	UPROPERTY() uint8 Tilt         = 128;
	UPROPERTY() uint8 Curve        = 128;
	UPROPERTY() uint8 BendStrength = 200;
	UPROPERTY() uint8 ColorVariant = 0;
};

// Shared state for a contiguous run of blades. One cluster lives per
// (cell, type, group, biome) so streaming and pooling operate at this
// level rather than per blade.
USTRUCT()
struct KBVEWORLD_API FKBVEGrassCluster
{
	GENERATED_BODY()

	UPROPERTY() uint32 ClusterHash = 0;
	UPROPERTY() uint16 TypeId      = 0;
	UPROPERTY() uint16 GroupId     = 0;

	UPROPERTY() FVector3f Origin = FVector3f::ZeroVector;
	UPROPERTY() float     Radius = 0.f;

	UPROPERTY() uint32 BladeStart = 0;
	UPROPERTY() uint32 BladeCount = 0;

	UPROPERTY() uint8 ColorPaletteId = 0;
	UPROPERTY() uint8 DensityTier    = 0;
	UPROPERTY() uint8 WindZoneId     = 0;
	UPROPERTY() uint8 LODTier        = 0;
};

// Far-LOD impostor record. Replaces the cluster's per-blade run with a
// single atlas-backed billboard once the cluster is far enough out.
// Many clusters share the same AtlasIndex via ClusterVisualKey reuse
// so the GPU only stores one texture per unique (type, group, biome,
// palette, density) family.
USTRUCT()
struct KBVEWORLD_API FKBVEGrassClusterImpostor
{
	GENERATED_BODY()

	UPROPERTY() FVector3f Center      = FVector3f::ZeroVector;
	UPROPERTY() float     Radius      = 0.f;

	UPROPERTY() uint32    ClusterHash = 0;
	UPROPERTY() uint32    VisualKey   = 0;

	UPROPERTY() uint16    TypeId      = 0;
	UPROPERTY() uint16    GroupId     = 0;

	UPROPERTY() uint16    AtlasIndex     = 0;
	UPROPERTY() uint8     ColorPaletteId = 0;
	UPROPERTY() uint8     WindZoneId     = 0;
	UPROPERTY() uint8     LODTier        = 0;
};

class KBVEWORLD_API FKBVEWorldGrassHash
{
public:
	// Deterministic cluster key. Same (cell, type, group, biome) always
	// resolves to the same hash, so streaming a chunk back in restores
	// every cluster without persisting blade buffers to disk.
	static uint32 MakeClusterKey(int32 WorldCellX, int32 WorldCellY, uint16 TypeId, uint16 GroupId, uint8 BiomeId)
	{
		uint32 H = static_cast<uint32>(WorldCellX) * 0x9E3779B1u;
		H ^= static_cast<uint32>(WorldCellY) * 0x85EBCA77u + (H << 6) + (H >> 2);
		H ^= (uint32(TypeId)  << 16) | uint32(GroupId);
		H *= 0xC2B2AE35u;
		H ^= uint32(BiomeId) * 0x27D4EB2Fu;
		H ^= H >> 16;
		return H ? H : 1u;
	}

	// Visual-asset reuse key. Same (type, group, biome, palette, density)
	// resolves to the same impostor atlas slot so unrelated clusters
	// across the world share one baked texture.
	static uint32 MakeVisualKey(uint16 TypeId, uint16 GroupId, uint8 BiomeId, uint8 ColorPaletteId, uint8 DensityTier)
	{
		uint32 H = (uint32(TypeId) << 16) | uint32(GroupId);
		H ^= uint32(BiomeId) * 0x9E3779B1u;
		H ^= uint32(ColorPaletteId) * 0x85EBCA77u;
		H ^= uint32(DensityTier) * 0xC2B2AE35u;
		H ^= H >> 16;
		return H ? H : 1u;
	}

	// Cheap per-blade phase seed inside a cluster — feeds the material's
	// WindPhase custom data so identical clusters don't sway in lockstep.
	static float MakeBladePhase(uint32 ClusterHash, uint32 BladeIndexInCluster)
	{
		uint32 H = ClusterHash;
		H ^= BladeIndexInCluster * 0x45D9F3Bu;
		H = (H ^ (H >> 16)) * 0x85EBCA6Bu;
		H = (H ^ (H >> 13)) * 0xC2B2AE35u;
		H ^= H >> 16;
		return float(H & 0xFFFFFFu) * (6.2831853f / 16777216.f);
	}
};

// Pool of cluster + blade buffers. ChunkActor borrows on stream-in and
// returns on stream-out. Cluster->blade run is indexed via FKBVEGrassCluster::
// BladeStart / BladeCount into the pool's flat blade array.
class KBVEWORLD_API FKBVEWorldGrassClusterPool
{
public:
	static FKBVEWorldGrassClusterPool& Get();

	const FKBVEGrassCluster* FindCluster(uint32 ClusterHash) const;
	FKBVEGrassCluster&       AcquireCluster(uint32 ClusterHash);
	void                     ReleaseCluster(uint32 ClusterHash);
	void                     ReleaseAll();

	TArrayView<const FKBVEGrassBladePacked> GetBlades(const FKBVEGrassCluster& Cluster) const;
	TArrayView<FKBVEGrassBladePacked>       AllocateBladeRun(FKBVEGrassCluster& Cluster, uint32 Count);

	int32 GetClusterCount() const { return Clusters.Num(); }
	int32 GetBladeCount()   const { return Blades.Num(); }

private:
	TMap<uint32, FKBVEGrassCluster> Clusters;
	TArray<FKBVEGrassBladePacked>   Blades;
	TArray<uint32>                  FreeBladeRuns;
};
