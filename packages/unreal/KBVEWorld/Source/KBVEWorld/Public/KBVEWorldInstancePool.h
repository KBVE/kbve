#pragma once

#include "CoreMinimal.h"
#include "Components/SceneComponent.h"
#include "Engine/EngineTypes.h"
#include "KBVEWorldInstanceSlots.h"

#include "KBVEWorldInstancePool.generated.h"

class UHierarchicalInstancedStaticMeshComponent;
class UMaterialInterface;
class UStaticMesh;

/**
 * One kind of repeated thing, and how the world should treat it.
 *
 * A pier is something a pawn walks into and something that should still be
 * there at the far edge of the view; a leaf of ivy is neither. Carrying that as
 * a description of the kind rather than as the pool's own policy is what keeps
 * a new decoration from being a change to the pool: adding shutters is a row
 * here, not another argument threaded through every caller.
 */
struct FKBVEWorldDecorKind
{
	UStaticMesh* Mesh = nullptr;
	UMaterialInterface* Material = nullptr;

	/** Where instances begin to fade, and where they are gone. Zero draws them all. */
	float CullStart = 0.0f;
	float CullEnd = 0.0f;

	/**
	 * What a pawn can hit.
	 *
	 * Off for anything decorative: a collision primitive per instance is memory
	 * and query time spent on something no trace will ever ask about, and there
	 * are thousands of leaves for every pier.
	 */
	ECollisionEnabled::Type Collision = ECollisionEnabled::NoCollision;

	/** Whether it casts one at all, and whether it is worth casting far. */
	bool bCastShadow = true;
	bool bCastFarShadow = false;
};

/**
 * The repeated pieces of a streamed world, drawn as instances instead of as
 * geometry each chunk carries for itself.
 *
 * A chunk that builds its own repeated parts into its own mesh section pays a
 * draw call per chunk for them and can share nothing between chunks -- and the
 * cost of that grows with the world rather than with what is on screen, because
 * every new kind of repeated thing brings its own section. This holds one
 * hierarchical instanced mesh per mesh-and-material pair instead, so a pier in
 * one chunk and a pier five chunks away are one draw call, and a cull distance
 * is set once per kind rather than per chunk.
 *
 * Transforms are submitted per key -- a chunk coordinate, usually -- and a key
 * is replaced wholesale from the caller's side. Underneath, a key keeps the
 * instances it already holds and writes over them, and a key that goes away
 * leaves its instances parked rather than removed. Nothing is ever cleared, so
 * the component never spends a frame holding nothing, and the work of a chunk
 * arriving is the size of that chunk rather than the size of the world.
 *
 * Submissions are in world space. The pool's own transform is not applied to
 * them, so a caller that has already rebased its geometry to a chunk origin has
 * to submit the unrebased transforms here.
 */
UCLASS(ClassGroup = (KBVEWorld), meta = (BlueprintSpawnableComponent))
class KBVEWORLD_API UKBVEWorldInstancePool : public USceneComponent
{
	GENERATED_BODY()

public:
	UKBVEWorldInstancePool();

	/**
	 * The bucket for a kind of thing, created on first use.
	 *
	 * Returns INDEX_NONE for a kind with no mesh, which is the signal a caller
	 * needs to fall back to building the geometry itself: the pool is only worth
	 * using where the level has assigned something to instance.
	 */
	int32 EnsureBucket(const FKBVEWorldDecorKind& Kind);

	/** Replace everything a key contributes to a bucket. An empty array clears it. */
	void Submit(int32 Bucket, const FIntPoint& Key, TArray<FTransform> Transforms);

	/** Drop a key from every bucket, for a chunk going out of the window. */
	void Release(const FIntPoint& Key);

	/**
	 * Drop every key from every bucket, keeping the buckets themselves.
	 *
	 * For a rebuild of the whole world rather than of one chunk: the components
	 * and their meshes are still wanted, and what has to go is everything that
	 * was submitted against the parameters somebody has just changed.
	 */
	void Empty();

	/** Rebuild whatever has changed since the last call. Cheap when nothing has. */
	void Flush();

	/**
	 * How many instances the pool holds, and how many of those are parked.
	 *
	 * For a readout rather than for logic. Parked ones are the measure of
	 * whether the window is settling: a number that keeps pace with the total
	 * is a pool reusing what chunks give up, and one that climbs on its own is
	 * a pool filling with instances nothing will ever write over again.
	 */
	void Describe(int32& OutInstances, int32& OutParked) const;

	/**
	 * Whether a bucket's instances cast a shadow, after it was made.
	 *
	 * A bucket is built once and lives as long as the world, so what it was
	 * told at creation is otherwise what it keeps -- and whether thousands of
	 * leaf cards are worth a shadow pass is exactly the kind of thing that has
	 * to be answered by turning it off and looking at the cost.
	 */
	void SetShadows(int32 Bucket, bool bCastShadow);

	/**
	 * Scale that maps a unit cube onto a box of this size.
	 *
	 * The mesh a level assigns is a cube of whatever size it was authored at, so
	 * a caller cannot know what to scale by without asking. Returns the identity
	 * scale for a mesh with no bounds, which keeps a bad asset visible rather
	 * than collapsing every instance to nothing.
	 */
	static FVector BoxScaleFor(const UStaticMesh* Mesh, const FVector& Size);

private:
	struct FBucket
	{
		TObjectPtr<UHierarchicalInstancedStaticMeshComponent> Mesh;
		TMap<FIntPoint, TArray<FTransform>> ByKey;

		/** Which instance each key holds, and which are parked. */
		FKBVEWorldInstanceSlots Slots;

		/** Keys whose transforms have changed since the last flush. */
		TSet<FIntPoint> Changed;
	};

	/** Write one key's transforms into the instances it holds. */
	void Settle(FBucket& Bucket, const FIntPoint& Key,
		TArray<TPair<int32, FTransform>>& Append);

	TArray<FBucket> Buckets;

	UPROPERTY(Transient)
	TArray<TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> Components;
};
