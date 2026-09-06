#pragma once

#include "CoreMinimal.h"
#include "Templates/UniquePtr.h"

struct FKBVEBvhSceneImpl;

/**
 * What a ray found, in the space the scene was built in.
 *
 * The triangle index is the primitive index tinybvh was handed, which for an
 * indexed build is the index triple and for a soup build is the vertex triple:
 * either way it addresses the caller's own arrays, not a copy.
 */
struct FKBVEBvhHit
{
	FVector Position = FVector::ZeroVector;
	float Distance = 0.0f;
	int32 Triangle = INDEX_NONE;
	float U = 0.0f;
	float V = 0.0f;
};

/**
 * A BVH over triangles the game generated rather than cooked.
 *
 * The world is procedural, so the meshes a query wants to hit exist as vertex
 * and index arrays long before -- and sometimes instead of -- anything with
 * Unreal collision on it. This builds a tree over those arrays directly, which
 * means line of sight, placement and grounding queries can run off the same
 * data the mesh was built from without a physics body, a cook, or a game thread.
 *
 * Positions are copied in at build time, so the caller's arrays are free to go.
 * Coordinates are stored as floats: build a scene in chunk-local space rather
 * than in world space if the world is large enough for that to matter.
 *
 * Not thread safe to build while querying; queries themselves are const and
 * may run on any thread once the build has returned.
 */
class KBVETINYBVH_API FKBVEBvhScene
{
public:
	FKBVEBvhScene();
	~FKBVEBvhScene();

	FKBVEBvhScene(FKBVEBvhScene&&) noexcept;
	FKBVEBvhScene& operator=(FKBVEBvhScene&&) noexcept;

	FKBVEBvhScene(const FKBVEBvhScene&) = delete;
	FKBVEBvhScene& operator=(const FKBVEBvhScene&) = delete;

	/** Build over an indexed triangle list. Indices must be a multiple of three. */
	bool Build(TArrayView<const FVector3f> Vertices, TArrayView<const uint32> Indices);

	/** Build over a triangle soup, three vertices per triangle. */
	bool Build(TArrayView<const FVector3f> Vertices);

	/**
	 * Spend longer building for a faster tree.
	 *
	 * Worth it for geometry that is queried far more often than it is rebuilt --
	 * a settlement that streams in once -- and not for anything rebuilt per tick.
	 * Set before Build; ignored afterwards.
	 */
	void SetHighQuality(bool bHighQuality);

	void Reset();

	bool IsBuilt() const;
	int32 NumTriangles() const;

	/** Nearest hit along the segment. */
	bool Raycast(const FVector& Start, const FVector& End, FKBVEBvhHit& OutHit) const;

	/** Whether anything at all blocks the segment, which is cheaper than finding what. */
	bool IsOccluded(const FVector& Start, const FVector& End) const;

	/** Whether any triangle reaches into the sphere. */
	bool OverlapsSphere(const FVector& Centre, float Radius) const;

private:
	TUniquePtr<FKBVEBvhSceneImpl> Impl;
	bool bHighQualityBuild = false;
};
