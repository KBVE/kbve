#pragma once

#include "CoreMinimal.h"
#include "KBVEMoverInteractable.h"
#include "GameFramework/Actor.h"
#include "KBVEWorldBridge.h"
#include "KBVEWorldFence.h"
#include "KBVEWorldHeightfieldParams.h"
#include "KBVEWorldRoadField.h"
#include "KBVEWorldRoadGraph.h"
#include "KBVEWorldSettlement.h"
#include "Mass/EntityHandle.h"
#include "MassArchetypeTypes.h"

#include "KBVEWorldRoadNetwork.generated.h"

class UKBVEWorldGrassAtlas;
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
class KBVEWORLD_API AKBVEWorldRoadChunk : public AActor, public IKBVEMoverInteractable
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

		/**
		 * The ivy, one array per sprig variant.
		 *
		 * Split by variant because a bucket is a mesh, and each variant is a
		 * different leaf off the sheet -- so what would otherwise be one array
		 * of transforms is already sorted into the buckets it is going into.
		 */
		TArray<TArray<FTransform>> Ivy;
	};

	/**
	 * Everything a chunk needs to build itself.
	 *
	 * Passed as one thing rather than as arguments because the list only ever
	 * grows: every structure the roads come to carry -- the crossings, the
	 * fences, whatever follows them -- wants its own shape and its own level of
	 * detail, and threading each one through as two more parameters is how a
	 * build function stops being readable.
	 */
	struct FBuild
	{
		FIntPoint Coord = FIntPoint::ZeroValue;
		int32 Seed = 0;
		bool bDetailed = true;
		float MaxDrawDistance = 0.0f;

		const FKBVEWorldRoadParams* Road = nullptr;
		const FKBVEWorldHeightfieldParams* Shape = nullptr;
		const FKBVEWorldRoadField* Field = nullptr;

		const FKBVEWorldBridgeParams* Bridge = nullptr;
		FKBVEWorldBridgeLod BridgeLod;

		const FKBVEWorldFenceParams* Fence = nullptr;

		const FKBVEWorldSettlementParams* Settlement = nullptr;
		EKBVEWorldWallDetail WallDetail = EKBVEWorldWallDetail::Full;

		UMaterialInterface* WoodMaterial = nullptr;
		UMaterialInterface* StoneMaterial = nullptr;
		UMaterialInterface* BrickMaterial = nullptr;
		UMaterialInterface* RoofMaterial = nullptr;
		UMaterialInterface* GlassMaterial = nullptr;

		/** What the ivy's own runners are drawn with. Unset draws no stems. */
		UMaterialInterface* VineMaterial = nullptr;
		const UStaticMesh* PartMesh = nullptr;

		/**
		 * How many sprig meshes the ivy has to draw from.
		 *
		 * The sheet decides it, so it arrives with the build rather than being a
		 * parameter: zero is a level with no ivy sheet assigned, and nothing is
		 * grown at all.
		 */
		int32 IvyVariants = 0;
	};

	void Build(const FBuild& In, FParts& OutParts);

	/**
	 * Stand this chunk's fences up again at whatever detail their runs now want.
	 *
	 * Kept off Build because it is the cheap half: the routes are already solved
	 * and held, so a run changing tier costs the posts it stands and nothing
	 * else. Returns false when no run had in fact changed.
	 */
	bool RebuildFences(const FBuild& In, FParts& OutParts);

	/**
	 * Stand this chunk's buildings up again at whatever detail they now want.
	 *
	 * The same trade the fences make and a coarser one: the plots are already
	 * sited, so a tier change costs the masonry and not the ground sampling that
	 * decided where a house could go. Returns false when nothing had changed.
	 */
	bool RebuildBuildings(const FBuild& In, FParts& OutParts);

	void Release();

	const FIntPoint& GetCoord() const { return Coord; }
	bool IsActive() const { return bActive; }

	/** The level this chunk's geometry was built at, so a changed ring can requeue it. */
	bool IsDetailed() const { return bDetailed; }

	/** The fence runs this chunk owns, as Mass entities. */
	const TArray<FMassEntityHandle>& GetFenceRuns() const { return FenceRuns; }

	/** The buildings this chunk owns, as Mass entities. */
	const TArray<FMassEntityHandle>& GetBuildings() const { return Buildings; }

	/**
	 * Where the last build's time went, split by what spent it.
	 *
	 * One number for a chunk says only that it was slow. The reason to split it
	 * is that the three things a chunk builds have completely different fixes --
	 * routing is a Viterbi pass, the fences are instanced, the masonry is
	 * triangles -- and optimising the wrong one is the usual way to spend a day.
	 */
	struct FTimings
	{
		float RouteMs = 0.0f;
		float FenceMs = 0.0f;
		float MasonryMs = 0.0f;
	};

	const FTimings& GetTimings() const { return Timings; }

	/**
	 * Swing the nearest door, which is what a chunk is asked when somebody presses
	 * interact while looking at one.
	 *
	 * The pawn traces and hands the actor it hit, which for a village is the whole
	 * chunk -- so the leaf is picked here, by which hinge is nearest whoever asked
	 * and in front of them. A doorway is a metre wide and the nearest hinge to
	 * somebody standing at one is not ambiguous.
	 */
	virtual void OnInteract_Implementation(AActor* Instigator) override;

	/**
	 * The network this chunk belongs to, which is its spawn owner.
	 *
	 * Where an open door is remembered. Reached through the owner rather than
	 * held, because a chunk is pooled and a pointer it kept would be one more
	 * thing to clear on the way back in.
	 */
	AKBVEWorldRoadNetwork* Doors() const;

	virtual void Tick(float DeltaSeconds) override;

private:
	/** One entity per run, spawned once the seed has decided where the runs are. */
	void SpawnFenceRuns(const FBuild& In);

	/** Hand the entities back, for a chunk leaving the window or being rebuilt. */
	void ReleaseFenceRuns();

	/** Stand every run up at whatever detail its entity currently asks for. */
	void BuildFenceParts(const FBuild& In, struct FKBVEWorldFenceMesh& Out);

	/** Site the plots this chunk's edges carry, which is what samples the ground. */
	void SitePlots(const FBuild& In);

	/**
	 * Cut a gap in the fences in front of every front door on this chunk.
	 *
	 * After the plots are sited and before the runs become entities: a house may
	 * be moved along the road to find level ground or refused outright, so where
	 * the doors are is not known until the ground has been asked, and the runs
	 * the entities carry should already have their gateways in them.
	 */
	void OpenGates(const FBuild& In);

	/**
	 * Hang this chunk's leaves on components of their own.
	 *
	 * Reuses whatever components are already here and hides the rest, so a
	 * village that shrinks does not leave doors standing in a field and one that
	 * grows does not pay to create components it had a moment ago.
	 */
	/** Put both plants' stems into the one section, or empty it of them. */
	void CommitVines(UMaterialInterface* Material);

	void CommitLeaves(const FKBVEWorldJoineryMesh& Fittings, const FVector& Origin,
		UMaterialInterface* Material);

	/** One entity per building, spawned once the seed has decided where they are. */
	void SpawnBuildings(const FBuild& In);

	void ReleaseBuildings();

	/** Build every building at whatever detail its entity currently asks for. */
	void BuildStructures(const FBuild& In, struct FKBVEWorldBuildingMesh& Out);

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> Wood;

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> Stone;

	/**
	 * The masonry of this chunk's settlement, as one section.
	 *
	 * Not instanced, and that is the difference between a wall and a pier. A pier
	 * is the same box everywhere, so it is worth an instance; a wall is a
	 * different size on every building and carries UVs worked out from its own
	 * length, which is what makes the coursing run continuously across the panels
	 * around a window instead of restarting at each of them. Written into one
	 * section per chunk, a village is one draw call and keeps its brickwork.
	 */
	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> Brick;

	/**
	 * The roofs, which are their own section because they are their own material.
	 *
	 * Brick walls under tile or shingle is what everywhere with both settled on,
	 * and a roof drawn in the wall's material reads as a building nobody finished.
	 */
	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> Roof;

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> Joinery;

	// Its own component because glass is the one surface here that is drawn
	// translucent, and a translucent section cannot share one with an opaque.
	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> Glazing;

	// Stone footings, which is the pier material on a building. Kept off the
	// Stone component the piers use rather than sharing it: a building changing
	// tier rebuilds its footings, and the bridges have no reason to be recooked
	// every time somebody walks towards a village.
	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> Plinth;

	/**
	 * The ivy's runners, which are neither masonry nor timber.
	 *
	 * A section of its own because it is the one thing in a chunk that crosses
	 * the others: a stem starts on a wall and ends under an eave, and its strip
	 * is a couple of centimetres wide -- so it shares no material and no UV
	 * parameterisation with anything it grows over.
	 */
	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> Vines;

	/**
	 * One component per door leaf, because a leaf is the one part of a building
	 * that moves and a section cannot be moved without rebuilding the buffer it
	 * shares with the whole settlement.
	 *
	 * Kept and reused rather than destroyed with the geometry: a chunk that
	 * streams out and back, or a village that changes tier, wants the same
	 * handful of components filled with different meshes.
	 */
	UPROPERTY()
	TArray<TObjectPtr<UProceduralMeshComponent>> LeafParts;

	/**
	 * Where each leaf hangs and how far round it currently is.
	 *
	 * Shut is zero and open is the leaf's own swing. Eased rather than snapped,
	 * and the actor only ticks while at least one of them is between the two.
	 */
	struct FLeaf
	{
		int32 Key = INDEX_NONE;
		FVector Hinge = FVector::ZeroVector;

		/**
		 * How the leaf stands when it is shut.
		 *
		 * Kept because a swing is this turned, not this replaced. Setting the
		 * relative rotation to a bare yaw throws away the frame that put the leaf
		 * in its wall, so the door would jump to a world axis the moment it moved.
		 */
		FQuat Base = FQuat::Identity;
		float Swing = 88.0f;
		float Angle = 0.0f;
		float Target = 0.0f;
	};

	TArray<FLeaf> Leaves;

	/**
	 * The routes this chunk's two edges took, kept rather than re-solved.
	 *
	 * A run changing its level of detail has to stand its posts somewhere, and
	 * the somewhere is the road's own polyline. Re-routing to find it again would
	 * cost a Viterbi pass per edge for what is a couple of hundred vectors held.
	 */
	TArray<TArray<FVector>> EdgePaths;

	/**
	 * What the crossings contributed, kept so a fence can be restood without it.
	 *
	 * The pool replaces a key wholesale and a fence shares its mesh and material
	 * with a pier, so the two land in the same bucket under the same key -- and a
	 * fence-only resubmit would take this chunk's bridges out of the world. Both
	 * go back every time instead.
	 */
	FParts BridgeParts;

	/**
	 * What this chunk's walls and its posts each grew, kept apart and kept at all.
	 *
	 * The same trap the bridges are held against, one level down: ivy from both
	 * sources lands in the same buckets under the same key, so a fence restood on
	 * its own would submit that the village's walls are bare. Held as sprigs
	 * rather than transforms because the mesh they scale against is the network's
	 * and a chunk never sees it.
	 */
	TArray<FKBVEWorldIvySprig> WallIvy;
	TArray<FKBVEWorldIvySprig> PostIvy;

	/**
	 * The stems those leaves are set on, in this chunk's own space.
	 *
	 * Held for the same reason the leaves are and rebuilt on the same terms: one
	 * section carries both plants, so a fence restood alone would have to write
	 * the walls' runners back into it from somewhere.
	 */
	FKBVEWorldRibbonMesh WallVines;
	FKBVEWorldRibbonMesh PostVines;

	UPROPERTY(Transient)
	TObjectPtr<class UMassEntitySubsystem> Mass;

	FMassArchetypeHandle FenceArchetype;
	FMassArchetypeHandle BuildingArchetype;

	TArray<FMassEntityHandle> FenceRuns;
	TArray<FKBVEWorldFenceRun> Runs;
	TArray<int32> RunEdge;

	TArray<FMassEntityHandle> Buildings;
	TArray<FKBVEWorldBuildingPlan> Plans;

	/** Which of the chunk's edges each plan was sited on, for the fence gates. */
	TArray<int32> PlanEdge;

	FTimings Timings;

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
	 * Which doors somebody has left open.
	 *
	 * Here rather than on a chunk because a chunk is the thing this has to
	 * outlive: they are pooled and handed back as the view moves, and a village
	 * rebuilds its geometry from scratch every time a building changes tier. A
	 * door remembered on either would shut itself the moment you walked far
	 * enough away to stop looking at it.
	 *
	 * Keyed by the building's own seed, so it survives the house being raised
	 * again somewhere else in the pool. Only the open ones are held: a world of
	 * shut doors costs nothing, which is the state nearly all of them are in.
	 */
	bool IsDoorOpen(int32 Key) const { return Key != INDEX_NONE && OpenDoors.Contains(Key); }

	void SetDoorOpen(int32 Key, bool bOpen)
	{
		if (Key == INDEX_NONE)
		{
			return;
		}

		if (bOpen)
		{
			OpenDoors.Add(Key);
		}
		else
		{
			OpenDoors.Remove(Key);
		}
	}

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

	/**
	 * The buildings that stand along the roads, taken from the streamer too.
	 *
	 * A settlement goes where the route already goes, because that is what a
	 * settlement is and because the road is a solved polyline by the time
	 * anything needs to know where a house belongs. Density is the only
	 * difference between the village this raises and a town -- and the streamer
	 * holds the numbers because it plans the start from them, so a copy edited
	 * here would put the player in a village this actor then declines to build.
	 */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVEWorld|Road")
	FKBVEWorldSettlementParams Settlement;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road")
	FKBVEWorldBridgeParams Bridge;

	/**
	 * The fences that run alongside the roads.
	 *
	 * Aesthetic rather than meaningful, and deliberately not everywhere: what
	 * gives a road an edge is having one occasionally, and a fence down every
	 * road is a corridor from one end of the world to the other.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road")
	FKBVEWorldFenceParams Fence;


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

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road")
	TObjectPtr<UMaterialInterface> BrickMaterial;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road")
	TObjectPtr<UMaterialInterface> RoofMaterial;

	/** Thin translucent glass. Without one the windows are framed openings. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Materials")
	TObjectPtr<UMaterialInterface> GlassMaterial;

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

	/**
	 * The leaves the walls and the fence posts are grown from.
	 *
	 * The same sheet asset a grass field draws its clumps out of, because it is
	 * the same question: a masked material and the rectangles on it that are a
	 * plant. Left unset, nothing grows -- the masonry and the posts are built
	 * exactly as they were.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Foliage")
	TObjectPtr<UKBVEWorldGrassAtlas> IvyAtlas;

	/**
	 * Which cells of that sheet are this plant's leaf.
	 *
	 * A scanned sheet is a botanist's page: seventeen leaves off however many
	 * plants, variegated beside plain and lime beside near-black. Drawn from
	 * evenly, a wall carries all of them and reads as a collection rather than
	 * as one thing growing -- so a level says which few belong to the plant it
	 * wants. Empty draws from the whole sheet, which is almost never right.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Foliage")
	TArray<int32> IvyLeafCells;

	/**
	 * What the ivy's runners are drawn with.
	 *
	 * A stem is a strip a couple of centimetres across, so almost any tiling
	 * timber does: what it must not be is the leaf material, which is masked and
	 * would cut the stem out of itself.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Foliage")
	TObjectPtr<UMaterialInterface> IvyStemMaterial;

	/**
	 * How far out the leaves are drawn, as a share of everything else.
	 *
	 * A pier has a silhouette worth keeping to the edge of the view; a leaf is a
	 * few pixels well before that, and there are thousands of them for every
	 * pier. Dropping them earlier than the wall they are on is the cheapest
	 * saving the ivy has, and the wall is what reads at distance anyway.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Foliage",
		meta = (ClampMin = "0.05", ClampMax = "1.0"))
	float IvyDrawShare = 0.6f;

	/**
	 * Throw the world's chunks away and build them again.
	 *
	 * Every number the roads, the fences, the villages and their ivy are grown
	 * from is a property on this actor, and every one of them is read at build
	 * time -- so a chunk that is already standing keeps whatever it was built
	 * with however far the details panel is dragged. This is how a change to
	 * them is seen without restarting the editor, and it is the whole of what
	 * `kbve.Road.Regrow` does.
	 *
	 * The buckets go with it. Which cells of a sheet are this plant's leaf
	 * decides which meshes the instances are drawn from, and those are made once
	 * on the first tick that can make them.
	 */
	UFUNCTION(BlueprintCallable, CallInEditor, Category = "KBVEWorld|Road")
	void Regrow();

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

	/** Take the seed, the terrain shape, the roads and the villages off it. */
	void SyncFromStreamer();
	FIntPoint ChunkCoordAt(const FVector& WorldLocation) const;
	bool WantsDetail(const FIntPoint& Centre, const FIntPoint& Coord) const;

	/** Everything a chunk build needs, gathered from this actor's own settings. */
	AKBVEWorldRoadChunk::FBuild MakeBuild(const FIntPoint& Coord, int32 Seed, bool bDetailed,
		bool bInstanced, float DrawDistance) const;
	/**
	 * Stand up one bucket per sprig variant, once the atlas has arrived.
	 *
	 * Made on the first tick that can make them, like the crossings' own, so a
	 * level that assigns its sheet later does not need the actor rebuilt. Tells
	 * the fences and the settlement how many variants there turned out to be:
	 * the sheet decides that, not the parameters.
	 */
	void EnsureIvyBuckets(float DrawDistance);

	/** Hand one chunk's ivy to the buckets, or clear them of it. */
	void SubmitIvy(const FIntPoint& Key, AKBVEWorldRoadChunk::FParts& ChunkParts);

	void ReleaseOutsideRadius(const FIntPoint& Centre);
	void QueueInsideRadius(const FIntPoint& Centre);

	UPROPERTY(Transient)
	TMap<FIntPoint, TObjectPtr<AKBVEWorldRoadChunk>> Live;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AKBVEWorldRoadChunk>> Pool;

	/** Keys of the doors left open, and nothing about the shut ones. */
	TSet<int32> OpenDoors;

	UPROPERTY(Transient)
	TObjectPtr<class AKBVEWorldStreamer> Streamer;

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UKBVEWorldInstancePool> Parts;

	int32 StoneBucket = INDEX_NONE;
	int32 WoodBucket = INDEX_NONE;

	/** One bucket per sprig variant, made the first tick the atlas is there. */
	TArray<int32> IvyBuckets;

	/** How many leaves the window's fill put up, counted with its timings. */
	int32 IvySprigs = 0;

	TArray<FIntPoint> Pending;
	FIntPoint LastCentre = FIntPoint(MAX_int32, MAX_int32);
	float LastBuildMs = 0.0f;

	/** Summed across the chunks of one window fill, so the log names the cost. */
	AKBVEWorldRoadChunk::FTimings FillTimings;
};
