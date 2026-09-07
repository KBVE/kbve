#pragma once

#include "CoreMinimal.h"

class UMaterialInterface;
class UObject;
class UStaticMesh;

/**
 * The mesh and the material a field of grass is drawn with.
 *
 * A clump is crossed quads with an atlas cell on them, not modelled blades. The
 * blades are already in the texture, so geometry that repeats them pays for the
 * same silhouette twice -- and at the instance counts a ground cover needs, the
 * difference between six triangles and six hundred is the whole budget.
 *
 * Cells are UV rectangles into one atlas, given as (U0, V0, U1, V1). A quad
 * takes its width from the cell's own aspect rather than from a parameter, so a
 * tall stem and a wide rosette come off the same sheet without either being
 * stretched to fit a shape it was not photographed in.
 */
struct KBVEWORLD_API FKBVEWorldGrassCard
{
	struct FSpec
	{
		/** UV rectangles this clump's sheets are cut from, one per sheet. */
		TArray<FVector4f> Cells;

		/** Height of the tallest sheet in world units. Width follows the cell. */
		float Height = 110.0f;

		/**
		 * Screen size at which the clump drops to a single sheet.
		 *
		 * Roughly twice the clump's radius over the distance to it, so smaller
		 * is further away. The build's own default of 0.75 is close enough to
		 * touching that the reduced level is what the whole field draws.
		 */
		float ReducedScreenSize = 0.05f;

		/** Distinguishes one variant's cache entry from another's. */
		FName UniqueId = TEXT("KBVEWorld_GrassCard");
	};

	/**
	 * A clump mesh for this spec, built once and shared.
	 *
	 * Cached on the spec rather than rebuilt per caller because every tile in
	 * the ring instances the same handful of variants: the mesh is shared state
	 * by construction, and building it twice would only mean two of it.
	 */
	static UStaticMesh* GetOrCreateClumpMesh(UObject* Outer, const FSpec& Spec, UMaterialInterface* Material);
};
