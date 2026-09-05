#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KBVEWorldBridge.h"
#include "KBVEWorldHeightfieldParams.h"
#include "KBVEWorldRoadField.h"
#include "KBVEWorldRoadGraph.h"

#include "KBVEWorldRoadNetwork.generated.h"

class UKBVEWorldInstancePool;
class UMaterialInterface;
class UProceduralMeshComponent;
class UStaticMesh;

/**
 * The bridges the two road edges one chunk owns need.
 *
 * A chunk builds its edges to the neighbours at +X and +Y and no others, so
 * every edge in the network has exactly one owner and the plane is covered
 * without any chunk having to know what its neighbours built. The road surface
 * is not here: it is painted and graded into the terrain itself, leaving this
 * actor only the parts of a road that genuinely stand off the ground.
 */
UCLASS()
class KBVEWORLD_API AKBVEWorldRoadChunk : public AActor
{
	GENERATED_BODY()

public:
	AKBVEWorldRoadChunk();

	/**
	 * The parts a crossing wants instanced, alongside the geometry it keeps.
	 *
	 * Handed back rather than submitted here: the pool holds one component for
	 * the whole world, so it belongs to the network and a chunk has no business
	 * reaching into it.
	 */
	struct FParts
	{
		TArray<FTransform> Stone;
		TArray<FTransform> Wood;
	};

	void Build(const FIntPoint& InCoord, int32 InSeed, const FKBVEWorldRoadParams& Road,
		const FKBVEWorldBridgeParams& Bridge, const FKBVEWorldBridgeLod& Lod,
		const FKBVEWorldHeightfieldParams& Shape, const FKBVEWorldRoadField* Field,
		UMaterialInterface* WoodMaterial, UMaterialInterface* StoneMaterial,
		const UStaticMesh* PartMesh, float MaxDrawDistance, bool bInDetailed,
		FParts& OutParts);

	void Release();

	const FIntPoint& GetCoord() const { return Coord; }
	bool IsActive() const { return bActive; }

	/** The level this chunk's geometry was built at, so a changed ring can requeue it. */
	bool IsDetailed() const { return bDetailed; }

private:
	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> Wood;

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> Stone;

	FIntPoint Coord = FIntPoint::ZeroValue;
	bool bActive = false;
	bool bDetailed = true;
};

/**
 * Keeps road chunks around the viewer, the same window the terrain streamer
 * keeps patches in.
 *
 * Nothing here is authored and nothing is saved: the network is a pure function
 * of the world seed, so a chunk rebuilt an hour later is the same road, and the
 * server derives the identical one without a byte crossing the wire.
 */
UCLASS()
class KBVEWORLD_API AKBVEWorldRoadNetwork : public AActor
{
	GENERATED_BODY()

public:
	AKBVEWorldRoadNetwork();

	/**
	 * Seed, terrain shape and road network, taken from the terrain streamer.
	 *
	 * Copied from it every tick rather than set here: the ground is graded for
	 * these roads, so a road actor with its own idea of them lays a surface onto
	 * a corridor that was cut somewhere else. Shown read-only so the streamer
	 * stays the one place they are edited.
	 */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVEWorld|Road")
	int64 WorldSeed = 1337;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVEWorld|Road")
	FKBVEWorldHeightfieldParams Shape;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVEWorld|Road")
	FKBVEWorldRoadParams Road;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road")
	FKBVEWorldBridgeParams Bridge;

	/**
	 * Chunks kept either side of the viewer's own.
	 *
	 * Smaller than the terrain radius on purpose: a road is a thin thing that
	 * disappears into fog long before the ground it sits on does, and each chunk
	 * here costs a Viterbi route per edge rather than a noise fill.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road",
		meta = (ClampMin = "1", ClampMax = "16"))
	int32 ViewRadiusChunks = 3;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road",
		meta = (ClampMin = "1"))
	int32 MaxBuildsPerTick = 2;

	/**
	 * Rings whose crossings are built with their under-frame and their full
	 * curve refinement.
	 *
	 * A procedural mesh section has one level of detail and no screen-size
	 * reduction of its own, so without this every girder, cross beam and
	 * subdivided rail quad at the edge of the window is drawn at full density
	 * for a bridge a few pixels wide. The window is rebuilt when it moves, which
	 * is what makes the ring the cheapest place to answer this.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road|Lod",
		meta = (ClampMin = "0"))
	int32 DetailRadiusChunks = 1;

	/**
	 * How far past the window's own edge a crossing keeps drawing, in chunks.
	 *
	 * Zero draws to the far plane. The margin is there because the cull is a
	 * hard cut and the window's edge is where chunks are released anyway: culling
	 * exactly at it would put the two pops in the same place and make one visible
	 * pop out of two invisible ones.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road|Lod",
		meta = (ClampMin = "0.0"))
	float DrawDistanceMarginChunks = 1.0f;

	/**
	 * Assigned from the level, the same contract the terrain streamer has for
	 * its own material. The plugin is game-agnostic and has no business knowing
	 * an asset path in some project's content.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road")
	TObjectPtr<UMaterialInterface> WoodMaterial;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road")
	TObjectPtr<UMaterialInterface> StoneMaterial;

	/**
	 * A cube, for the parts of a crossing that are one.
	 *
	 * The piers, the abutments and the cross beams are all a box, and a box is
	 * worth handing to an instanced mesh rather than building into every chunk
	 * that holds one: instanced, a pier here and a pier five chunks away are one
	 * draw call between them, and the cost stops growing with the world. Left
	 * unset they are triangulated into the chunk as before, so a level that has
	 * assigned nothing still gets its bridges.
	 *
	 * Any cube of any size, centred on its own origin -- the scale onto each box
	 * is worked out from the mesh's bounds rather than assumed.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road|Lod")
	TObjectPtr<UStaticMesh> PartMesh;

	virtual void Tick(float DeltaSeconds) override;

#if WITH_EDITOR
	virtual bool ShouldTickIfViewportsOnly() const override { return true; }
#endif

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	bool TryGetViewLocation(FVector& Out) const;
	class AKBVEWorldStreamer* FindStreamer();
	FIntPoint ChunkCoordAt(const FVector& WorldLocation) const;
	bool WantsDetail(const FIntPoint& Centre, const FIntPoint& Coord) const;
	void ReleaseOutsideRadius(const FIntPoint& Centre);
	void QueueInsideRadius(const FIntPoint& Centre);

	UPROPERTY(Transient)
	TMap<FIntPoint, TObjectPtr<AKBVEWorldRoadChunk>> Live;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AKBVEWorldRoadChunk>> Pool;

	UPROPERTY(Transient)
	TObjectPtr<class AKBVEWorldStreamer> Streamer;

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UKBVEWorldInstancePool> Parts;

	int32 StoneBucket = INDEX_NONE;
	int32 WoodBucket = INDEX_NONE;

	TArray<FIntPoint> Pending;
	FIntPoint LastCentre = FIntPoint(MAX_int32, MAX_int32);
	float LastBuildMs = 0.0f;
};
