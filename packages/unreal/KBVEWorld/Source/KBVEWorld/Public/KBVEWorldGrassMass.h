#pragma once

#include "CoreMinimal.h"
#include "MassCommonFragments.h"
#include "MassEntityTypes.h"
#include "MassEntityQuery.h"
#include "MassProcessor.h"
#include "KBVEWorldGrassMass.generated.h"

class UHierarchicalInstancedStaticMeshComponent;

// Mass fragment carrying one grass cluster's pool key + visual key + world
// pivot + wind phase. Identifies a cluster entity across streaming; the
// processor reads this to drive LOD pick + per-instance custom data sync
// without touching the cluster pool from the game thread.
USTRUCT()
struct KBVEWORLD_API FKBVEGrassClusterFragment : public FMassFragment
{
	GENERATED_BODY()

	UPROPERTY() uint32    ClusterHash = 0;
	UPROPERTY() uint32    VisualKey   = 0;
	UPROPERTY() FVector3f Origin      = FVector3f::ZeroVector;
	UPROPERTY() float     Radius      = 0.f;
	UPROPERTY() float     WindPhase   = 0.f;
	UPROPERTY() uint16    TypeId      = 0;
	UPROPERTY() uint16    GroupId     = 0;
	UPROPERTY() uint8     ColorPaletteId = 0;
	UPROPERTY() uint8     DensityTier    = 0;
	UPROPERTY() uint8     WindZoneId     = 0;
	UPROPERTY() uint8     LODTier        = 0;
};

// Tag identifies a Mass entity as a grass cluster. Query selector for
// the processor.
USTRUCT()
struct KBVEWORLD_API FKBVEGrassClusterTag : public FMassTag
{
	GENERATED_BODY()
};

// Optional payload — back-reference to the HISM components that this
// cluster owns. The processor uses it to sync per-instance custom data
// from packed blade state. Held as raw weak pointers so the cluster
// pool can be authoritative without UObject churn.
USTRUCT()
struct KBVEWORLD_API FKBVEGrassClusterHISMRefs : public FMassFragment
{
	GENERATED_BODY()

	UPROPERTY() TWeakObjectPtr<UHierarchicalInstancedStaticMeshComponent> BladeHISM;
	UPROPERTY() TWeakObjectPtr<UHierarchicalInstancedStaticMeshComponent> ImpostorHISM;
	UPROPERTY() TWeakObjectPtr<UHierarchicalInstancedStaticMeshComponent> GroundTintHISM;

	UPROPERTY() int32 BladeInstanceFirst    = -1;
	UPROPERTY() int32 BladeInstanceCount    = 0;
	UPROPERTY() int32 ImpostorInstanceFirst = -1;
	UPROPERTY() int32 ImpostorInstanceCount = 0;
	UPROPERTY() int32 TintInstanceFirst     = -1;
	UPROPERTY() int32 TintInstanceCount     = 0;
};

// Read-only LOD tier; the processor decides which HISM range is visible
// based on chebyshev grid distance to the player chunk passed in shared
// data. Splits the 6-tier LOD chain into a single byte the material reads.
UENUM()
enum class EKBVEGrassLODTier : uint8
{
	LOD0_RealBlade    = 0,
	LOD1_ReducedCard  = 1,
	LOD2_ThreeSheet   = 2,
	LOD3a_AtlasBillboard = 3,
	LOD3b_GroundTint  = 4,
	LOD4_TerrainTint  = 5,
	Inactive          = 6,
};

// Stub processor — runs on the world's MassEntitySubsystem each tick,
// iterates entities with the FKBVEGrassClusterTag, recomputes the LOD
// tier from chebyshev(clusterChunk, playerLookaheadCenter), and writes
// the result back into the cluster fragment. HISM refs are not synced
// yet; that lands when the chunk actor migrates to spawn entities.
UCLASS()
class KBVEWORLD_API UKBVEGrassClusterProcessor : public UMassProcessor
{
	GENERATED_BODY()

public:
	UKBVEGrassClusterProcessor();

protected:
	virtual void ConfigureQueries(const TSharedRef<FMassEntityManager>& EntityManager) override;
	virtual void Execute(FMassEntityManager& EntityManager, FMassExecutionContext& Context) override;

	FMassEntityQuery ClusterQuery;

	FIntPoint LastPlayerChunk = FIntPoint(INT32_MIN, INT32_MIN);
};
