#pragma once

#include "CoreMinimal.h"
#include "Components/SceneComponent.h"

#include "KBVEWorldInstancePool.generated.h"

class UHierarchicalInstancedStaticMeshComponent;
class UMaterialInterface;
class UStaticMesh;

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
 * is replaced wholesale rather than edited. Instance indices shuffle when one is
 * removed, so tracking them across a moving window is a class of bug that is not
 * worth the arithmetic it saves: a bucket is rebuilt from its keys instead, and
 * AddInstances takes the whole array in one call.
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
	 * The bucket for a mesh and material, created on first use.
	 *
	 * Returns INDEX_NONE for a null mesh, which is the signal a caller needs to
	 * fall back to building the geometry itself: the pool is only worth using
	 * where the level has assigned something to instance.
	 */
	int32 EnsureBucket(UStaticMesh* Mesh, UMaterialInterface* Material, float CullDistance);

	/** Replace everything a key contributes to a bucket. An empty array clears it. */
	void Submit(int32 Bucket, const FIntPoint& Key, TArray<FTransform> Transforms);

	/** Drop a key from every bucket, for a chunk going out of the window. */
	void Release(const FIntPoint& Key);

	/** Rebuild whatever has changed since the last call. Cheap when nothing has. */
	void Flush();

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
		bool bDirty = false;
	};

	TArray<FBucket> Buckets;

	UPROPERTY(Transient)
	TArray<TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> Components;
};
