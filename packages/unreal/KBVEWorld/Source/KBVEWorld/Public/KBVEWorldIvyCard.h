#pragma once

#include "CoreMinimal.h"

class UKBVEWorldGrassAtlas;
class UMaterialInterface;
class UObject;
class UStaticMesh;

/**
 * The meshes a wall's ivy is instanced from: a few leaves on a stretch of stem.
 *
 * Flat quads and not the crossed pair the grass uses, which is the one place the
 * two part company. A clump of grass stands in the open and is looked at from
 * every side, so it needs a second sheet to have a silhouette from more than
 * one; a leaf of ivy is held flat against masonry, and a card crossed through
 * that wall is half a leaf inside the brick.
 *
 * Several leaves to a mesh rather than one, because a runner sets them in the
 * same arrangement the whole way up: alternating sides, falling away in size.
 * Baking that pattern into the mesh costs a third of the instances for the same
 * wall, and the pattern was being built one instance at a time anyway.
 */
struct KBVEWORLD_API FKBVEWorldIvyCard
{
	/**
	 * How tall the variant meshes are built, in world units.
	 *
	 * Instances carry their own size as a scale off this, so the number itself
	 * decides nothing -- what it must not do is change without the scale that
	 * divides by it, which is why both sides read it from here.
	 */
	static constexpr float SprigHeight = 100.0f;

	/**
	 * One mesh per named cell of the sheet.
	 *
	 * Which cells is the caller's to say, and saying it is the whole point: a
	 * scanned sheet holds several plants' leaves, and a wall that draws from all
	 * of them reads as a collection rather than as one thing growing. An empty
	 * list falls back to the first few cells, which is a sheet nobody has picked
	 * from yet rather than a choice.
	 *
	 * Built once and shared, because every wall in the world draws the same
	 * handful of leaves. Returns what it managed to build, which is nothing at
	 * all when the atlas has no material or no cells.
	 */
	static void SprigMeshes(UObject* Outer, const UKBVEWorldGrassAtlas* Atlas,
		TArrayView<const int32> Cells, int32 Fallback, int32 Leaves,
		TArray<UStaticMesh*>& Out);

	/**
	 * One sprig mesh, built once and shared under the name it is given.
	 *
	 * How far up its own stem the leaves sit is a fraction of the leaf's height,
	 * so the whole sprig scales as one thing: a plant with bigger leaves sets
	 * them further apart, which is what a bigger plant does.
	 */
	static UStaticMesh* Sprig(UObject* Outer, const FVector4& Cell, int32 Leaves,
		UMaterialInterface* Material, FName Id);

	/** How many leaves one sprig mesh carries, before anything overrides it. */
	static constexpr int32 LeavesPerSprig = 3;
};
