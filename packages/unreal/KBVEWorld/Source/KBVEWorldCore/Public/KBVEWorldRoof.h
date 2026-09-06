#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldRibbon.h"

#include "KBVEWorldRoof.generated.h"

/**
 * What covers a building.
 *
 * Its own file and its own material, because a roof is the one part of a house
 * that is never masonry: brick walls under a tiled or shingled roof is the
 * vernacular everywhere that has both, and a roof drawn in the wall's material
 * reads as a building someone forgot to finish.
 */
UENUM()
enum class EKBVEWorldRoofStyle : uint8
{
	/** Two slopes meeting at a ridge, with the end walls carried up in masonry. */
	Gable,

	/** Four slopes and a shortened ridge. No masonry above the wall plate. */
	Hip,
};

USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldRoofParams
{
	GENERATED_BODY()

	/**
	 * How steep the slopes are, in degrees from horizontal.
	 *
	 * Shallow enough and it reads as a flat lid on a box; steep enough and the
	 * building is more roof than wall. Somewhere near forty is what most places
	 * that get weather settled on.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Roof",
		meta = (ClampMin = "5.0", ClampMax = "70.0"))
	float Pitch = 38.0f;

	/**
	 * How far the eaves reach past the wall below them.
	 *
	 * The single most valuable number here. A roof flush with its walls reads as
	 * a solid extruded shape; an overhang throws a shadow line along the top of
	 * the wall and separates the two, which is most of what makes a building look
	 * built rather than modelled.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Roof", meta = (ClampMin = "0.0"))
	float Overhang = 58.0f;

	/**
	 * How deep the roof slab is, measured vertically.
	 *
	 * Vertical rather than perpendicular to the slope, so the exposed edge at the
	 * eave is a vertical band -- which is what a fascia board is, and what the eye
	 * expects to find under an overhang.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Roof", meta = (ClampMin = "1.0"))
	float Thickness = 17.0f;

	/** World units of roof per texture tile, as the wall's own figure is. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Roof", meta = (ClampMin = "1.0"))
	float TileLength = 190.0f;

	/** How likely a building is hipped rather than gabled. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Roof",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float HipChance = 0.3f;

};

/** Where a roof sits, in the terms its building already knows. */
struct FKBVEWorldRoofBuild
{
	/** Footprint centre, at the height of the wall plate the roof rests on. */
	FVector Centre = FVector::ZeroVector;

	/** Which way the front faces, so the ridge can run parallel to the street. */
	float Yaw = 0.0f;

	/** Across the front, and back from it. The ridge runs along the width. */
	float Width = 800.0f;
	float Depth = 640.0f;

	int32 Seed = 0;
};

struct KBVEWORLDCORE_API FKBVEWorldRoof
{
	/** Which form the seed gave this building. */
	static EKBVEWorldRoofStyle StyleFor(const FKBVEWorldRoofParams& Roof, int32 Seed);

	/**
	 * How far the ridge stands above the wall plate.
	 *
	 * Wanted outside this file: a gable end is masonry, and the wall that carries
	 * it has to know how high to build before the roof is standing.
	 */
	static float Rise(const FKBVEWorldRoofParams& Roof, float Depth);

	/**
	 * Build one roof.
	 *
	 * Appends, like everything else, so a chunk's whole settlement is still one
	 * section per material however many houses are on it.
	 */
	static void Build(const FKBVEWorldRoofParams& Roof, const FKBVEWorldRoofBuild& In,
		FKBVEWorldRibbonMesh& Out);
};
