#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KBVEWorldHeightfieldParams.h"
#include "KBVEWorldPlan.h"
#include "KBVEWorldRoadField.h"
#include "KBVEWorldRoadGraph.h"

#include "KBVEWorldStreamer.generated.h"

class AKBVEWorldHeightfieldActor;
class UProceduralMeshComponent;
class UMaterialInterface;

KBVEWORLDCORE_API DECLARE_LOG_CATEGORY_EXTERN(LogKBVEWorldStream, Log, All);

/**
 * Keeps a window of heightfield patches around the viewer, so the world has no
 * edge to walk off.
 *
 * Patches are pooled, not destroyed: leaving a chunk behind and arriving at a
 * new one costs a rebuild, never a spawn. The set of live chunks is a function
 * of the viewer's chunk coordinate alone, so the same position always yields
 * the same world -- there is no accumulated state to drift.
 *
 * Generation is still synchronous on the game thread. That is deliberate for
 * now: it makes the cost visible and measurable before it moves onto the unr
 * tokio pool, which is where it belongs once the shape stops changing.
 */
UCLASS()
class KBVEWORLDCORE_API AKBVEWorldStreamer : public AActor
{
	GENERATED_BODY()

public:
	AKBVEWorldStreamer();
	virtual ~AKBVEWorldStreamer() override;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming")
	int64 WorldSeed = 1337;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming")
	FKBVEWorldHeightfieldParams Shape;

	/**
	 * The road network, which the terrain is graded for.
	 *
	 * Owned here rather than on the road actor because the ground has to know
	 * about roads before anything can be laid on it, and because two actors
	 * carrying their own copy of these numbers is two chances to disagree about
	 * where the roads are. The road actor reads them from this one.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming")
	FKBVEWorldRoadParams Road;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Plan")
	FKBVEWorldPlanParams Plan;

	/**
	 * Hold the player at the planned start until the ground under it exists.
	 *
	 * Two failures in one, and both of them only happen at the moment a world
	 * opens. A pawn dropped into a world that has not been built yet falls
	 * through it, because there is nothing to land on for as many ticks as the
	 * build queue is deep. And a pawn left wherever the level author put it
	 * streams the world in around there rather than around the start, so the
	 * queue spends the whole wait building ground nobody is going to.
	 *
	 * Held at the planned point, both actors centre on it -- the road network
	 * reads the pawn's location the same way this does -- so there is nothing to
	 * keep in step between them.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Plan")
	bool bHoldPlayerUntilReady = true;

	/** Cells per patch edge. Vertex cost per patch is (this + 1) squared. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming",
		meta = (ClampMin = "8", ClampMax = "256"))
	int32 CellsPerChunk = 128;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming",
		meta = (ClampMin = "1.0"))
	float CellSize = 100.0f;

	/**
	 * Chunks kept in each direction from the viewer's own chunk. The live count
	 * is (2r + 1) squared, so this is a quadratic cost knob, not a linear one.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming",
		meta = (ClampMin = "1", ClampMax = "32"))
	int32 ViewRadiusChunks = 6;

	/**
	 * Rings per LOD level. Patches this many rings out sample every other cell,
	 * twice that every fourth, and so on -- so cost grows with the radius rather
	 * than with its square, which is what lets the radius be large enough that
	 * new terrain arrives in fog instead of in front of you.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming",
		meta = (ClampMin = "1", ClampMax = "16"))
	int32 RingsPerLOD = 2;

	/**
	 * How far past a chunk boundary the view must travel before the window
	 * recentres, as a fraction of chunk size.
	 *
	 * Without it, a view sitting on a boundary flips the centre back and forth
	 * with any jitter, and every flip rebuilds the patches whose LOD ring
	 * changed -- measured at 55 patches and 23 ms per flip. A third-person
	 * camera orbits several hundred units as it turns, which is enough to cross
	 * a boundary on its own: turning on the spot near a corner hitched every
	 * frame.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming",
		meta = (ClampMin = "0.0", ClampMax = "0.5"))
	float RecentreHysteresis = 0.15f;

	/**
	 * Rings that cast shadows, counted from the centre.
	 *
	 * Every shadow-casting primitive is re-submitted once per cascade, so this
	 * multiplies the render thread's draw count rather than adding to it. The
	 * far rings sit in fog and their self-shadowing is not visible; the sun
	 * still shadows everything near the viewer. Negative means all rings.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming",
		meta = (ClampMin = "-1", ClampMax = "32"))
	int32 ShadowRadiusChunks = 2;

	/**
	 * Sample stride for the collision proxy on patches that carry collision.
	 *
	 * 1 means collision is the same surface that is drawn. Anything coarser cuts
	 * corners across the real ground: the proxy sits above it on concave slopes,
	 * so feet float, and below it on convex ones, so a camera probe slips under
	 * the visible surface. Both are visible immediately, which is why this
	 * defaults to matching rather than to being cheap.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming",
		meta = (ClampMin = "1", ClampMax = "16"))
	int32 CollisionLODStep = 1;

	/** Skirt depth handed to each patch. See AKBVEWorldHeightfieldActor. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming",
		meta = (ClampMin = "0.0"))
	float SkirtDepth = 400.0f;

	/**
	 * Hard cap on patches per tick, as a backstop to the millisecond budget.
	 *
	 * High on purpose: the budget below is the real limit, and a low count here
	 * throttles the cheap outer rings for no reason -- 169 patches at four per
	 * tick took 2.7 s to fill even once each one cost well under a millisecond.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming",
		meta = (ClampMin = "1"))
	int32 MaxBuildsPerTick = 32;

	/**
	 * Frame budget for patch building, milliseconds.
	 *
	 * A count is the wrong unit: a centre patch at full stride is two orders of
	 * magnitude more work than an outer one, so "four per tick" is a few hundred
	 * microseconds in one place and a dropped frame in another. Building stops
	 * once the budget is spent, whatever the count -- at least one patch always
	 * goes through, so progress cannot stall.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming",
		meta = (ClampMin = "0.1"))
	float MaxBuildMillisecondsPerTick = 4.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming")
	TObjectPtr<UMaterialInterface> TerrainMaterial;

	/**
	 * Surface for standing water, handed to every patch. Without it the carved
	 * river channels are dry trenches.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming")
	TObjectPtr<UMaterialInterface> WaterMaterial;

	/**
	 * The world's water, as one surface.
	 *
	 * It used to be a quad per patch, which bought a hundred and sixty-nine
	 * draws of the most expensive shading model in the scene and nothing else:
	 * the surface is flat and at a constant height, so there is no LOD to pick,
	 * no variation to carry, and -- measured -- no patch anywhere in the window
	 * whose ground stays above it, so nothing to cull either. The render thread
	 * is what this world is limited by, and half of what it was submitting was
	 * this.
	 */
	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Streaming")
	TObjectPtr<UProceduralMeshComponent> WaterPlane;

	/**
	 * Rings that get collision, counted from the centre.
	 *
	 * Collision is a second copy of the mesh and a physics cook per patch, so it
	 * is the most expensive thing a patch can carry. Only the patches a pawn can
	 * actually stand on need it; at radius 6 that is 9 of 169. Raise this only
	 * for things that travel far from the viewer, such as projectiles.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Streaming",
		meta = (ClampMin = "0", ClampMax = "32"))
	int32 CollisionRadiusChunks = 1;

	/** Where the seed said to start, and whether it had anywhere to offer. */
	const FKBVEWorldPlan& GetWorldPlan() const { return WorldPlan; }

	/** True while the player is being kept at the start waiting for ground. */
	UFUNCTION(BlueprintCallable, Category = "KBVEWorld|Plan")
	bool IsHoldingPlayer() const { return bHolding; }

	/** Chunk coordinate containing a world location. */
	UFUNCTION(BlueprintCallable, Category = "KBVEWorld|Streaming")
	FIntPoint ChunkCoordAt(const FVector& WorldLocation) const;

	UFUNCTION(BlueprintCallable, Category = "KBVEWorld|Streaming")
	int32 GetLiveChunkCount() const { return Live.Num(); }

	UFUNCTION(BlueprintCallable, Category = "KBVEWorld|Streaming")
	int32 GetPooledChunkCount() const { return Pool.Num(); }

	UFUNCTION(BlueprintCallable, Category = "KBVEWorld|Streaming")
	int32 GetPendingChunkCount() const { return Pending.Num(); }

	/** Total patches built since startup, including rebuilds of pooled ones. */
	UFUNCTION(BlueprintCallable, Category = "KBVEWorld|Streaming")
	int32 GetBuildCount() const { return BuildCount; }

	/** Milliseconds the last patch build cost on the game thread. */
	UFUNCTION(BlueprintCallable, Category = "KBVEWorld|Streaming")
	float GetLastBuildMs() const { return LastBuildMs; }

	FIntPoint GetCentre() const { return LastCentre; }

	/** The graded road corridors these patches are built against. */
	const FKBVEWorldRoadField* GetRoadField() const;

	virtual void Tick(float DeltaSeconds) override;
#if WITH_EDITOR
	// So the world exists in the editor viewport too. Without it the level looks
	// empty until PIE, which reads as a broken map rather than an unpopulated
	// one. Patches spawn transient, so none of this ends up saved into the umap.
	virtual bool ShouldTickIfViewportsOnly() const override { return true; }
#endif

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	/** Where the world should be built around. Falls back to this actor. */
	bool TryGetViewLocation(FVector& Out) const;

	/** Keep the pawn on the start, and let it go once there is ground under it. */
	void HoldOrRelease();

	/** Chunk coord for a view, refusing to leave the current one too eagerly. */
	FIntPoint StableChunkCoordAt(const FVector& WorldLocation) const;

	void ReleaseOutsideRadius(const FIntPoint& Centre);
	void QueueInsideRadius(const FIntPoint& Centre);

	/** Restate stride and collision on a patch that stays where it is, then rebuild it. */
	void RebuildInPlace(const FIntPoint& Coord);
	static void SetPatchVisible(AKBVEWorldHeightfieldActor* Patch, bool bVisible);

	/** Push this streamer's settings onto a patch for the given coordinate. */
	void ConfigurePatch(AKBVEWorldHeightfieldActor* Patch, const FIntPoint& Coord) const;

	mutable TUniquePtr<FKBVEWorldRoadField> RoadField;

	void BuildAndAccount(AKBVEWorldHeightfieldActor* Patch);
	void AccountBuild(AKBVEWorldHeightfieldActor* Patch, float ElapsedMs);
	void BuildChunk(const FIntPoint& Coord);

	/** Sample stride for a patch this many rings from the centre. */
	int32 LODStepForRing(int32 Ring) const;

	void RebuildWaterPlane(const FIntPoint& Centre);

	bool WantsCollisionAtRing(int32 Ring) const { return Ring <= CollisionRadiusChunks; }
	bool WantsShadowAtRing(int32 Ring) const
	{
		return ShadowRadiusChunks < 0 || Ring <= ShadowRadiusChunks;
	}

	float ChunkWorldSize() const { return CellsPerChunk * CellSize; }

	UPROPERTY(Transient)
	TMap<FIntPoint, TObjectPtr<AKBVEWorldHeightfieldActor>> Live;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AKBVEWorldHeightfieldActor>> Pool;

	TArray<FIntPoint> Pending;

	// Coordinates that are still live and still drawn, but whose stride or
	// collision no longer matches their ring. Separate from Pending because
	// these must not be torn down first: the pawn may be standing on one.
	TArray<FIntPoint> Restage;
	FIntPoint LastCentre = FIntPoint(MAX_int32, MAX_int32);

	FKBVEWorldPlan WorldPlan;
	bool bHolding = false;

	int32 BuildCount = 0;
	float LastBuildMs = 0.0f;

	// Per-LOD so the log says which ring the time went to, rather than only how
	// much there was of it.
	static constexpr int32 MaxTrackedLOD = 8;
	float BuildMsByLOD[MaxTrackedLOD] = {};
	float GenerateMsByLOD[MaxTrackedLOD] = {};
	float SectionMsByLOD[MaxTrackedLOD] = {};
	float FillMsByLOD[MaxTrackedLOD] = {};
	float RebuildMsByLOD[MaxTrackedLOD] = {};
	int32 BuildsByLOD[MaxTrackedLOD] = {};
	float WorstBuildMs = 0.0f;
	double FillStartSeconds = 0.0;
	// Wall time alone is misleading during start-up, when frames are long for
	// reasons that have nothing to do with terrain. Ticks and total build time
	// are what say whether the streamer is the thing costing anything.
	int32 FillTicks = 0;
	float FillBuildMs = 0.0f;
	// Spawning is not building. It is charged to the frame budget all the same,
	// so it has to be measured separately or the budget looks broken.
	float FillSpawnMs = 0.0f;
	int32 SpawnCount = 0;
};
