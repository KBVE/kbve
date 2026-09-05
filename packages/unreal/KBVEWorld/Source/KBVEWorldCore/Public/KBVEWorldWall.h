#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldRibbon.h"

#include "KBVEWorldWall.generated.h"

/**
 * A hole in a wall, in the wall's own frame.
 *
 * A door and a window are the same thing at different heights: one whose sill
 * is on the floor is a doorway, and nothing here needs to know which it is.
 */
struct FKBVEWorldWallOpening
{
	/** Centre of the opening, as distance from the wall's start. */
	float Along = 0.0f;

	/** Height of the sill above the wall's base. Zero is a doorway. */
	float Bottom = 0.0f;

	float Width = 90.0f;
	float Height = 130.0f;
};

/**
 * A rectangle of solid wall, in the wall's own frame.
 *
 * What a wall with holes in it decomposes into, and the reason this feature does
 * no cutting: a rectangular opening in a rectangular wall leaves rectangles, so
 * a window costs arithmetic rather than a boolean operation on a mesh. Four of
 * these is a wall with one window -- a pier either side, a panel under the sill
 * and a panel over the head -- and the same walk handles any number of openings.
 */
struct FKBVEWorldWallPanel
{
	float MinU = 0.0f;
	float MaxU = 0.0f;
	float MinV = 0.0f;
	float MaxV = 0.0f;

	float Width() const { return MaxU - MinU; }
	float Height() const { return MaxV - MinV; }
};

/**
 * Shape of one masonry wall.
 *
 * Sized in world units, which for this project is centimetres, so the defaults
 * read as a real wall: a course a little over eight centimetres, a storey a
 * little over three metres.
 */
USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldWallParams
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wall", meta = (ClampMin = "1.0"))
	float Thickness = 42.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wall", meta = (ClampMin = "1.0"))
	float Height = 320.0f;

	/**
	 * World units of wall per texture tile.
	 *
	 * The one number that decides how big a brick looks, and the reason walls
	 * carry their own UVs rather than taking a cube's. Square: the same figure
	 * across and up, so a panel of any proportion has bricks of one size in it.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wall", meta = (ClampMin = "1.0"))
	float TileLength = 220.0f;

	/**
	 * A single course of brick, which openings are snapped to.
	 *
	 * Masonry cannot put a sill halfway up a brick, and the eye knows it even
	 * when it could not say why: an opening that ignores the coursing reads as
	 * having been cut into the wall rather than built with it. Snapping is also
	 * what keeps a seeded window from landing a hair off the one beside it.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wall", meta = (ClampMin = "0.1"))
	float CourseHeight = 8.6f;

	/**
	 * A wider band around the foot of the wall.
	 *
	 * Structural on a real building and a different job here: the ground under a
	 * procedural village was never levelled for it, so a wall standing on its own
	 * footprint meets earth that rises and falls along its length. The plinth is
	 * what covers that, which is why it can be sunk further than it is tall.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wall|Plinth", meta = (ClampMin = "0.0"))
	float PlinthHeight = 34.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wall|Plinth", meta = (ClampMin = "0.0"))
	float PlinthOverhang = 7.0f;

	/** Stone over an opening, proud of the wall face and past it either side. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wall|Trim", meta = (ClampMin = "0.0"))
	float LintelHeight = 22.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wall|Trim", meta = (ClampMin = "0.0"))
	float LintelOverhang = 14.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wall|Trim", meta = (ClampMin = "0.0"))
	float LintelProud = 9.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wall|Trim", meta = (ClampMin = "0.0"))
	float SillHeight = 14.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wall|Trim", meta = (ClampMin = "0.0"))
	float SillOverhang = 11.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wall|Trim", meta = (ClampMin = "0.0"))
	float SillProud = 13.0f;
};

/**
 * How much of a wall is worth building at the range it is seen from.
 *
 * Ordered cheapest last, as the fence tiers are, so a comparison against a tier
 * is a comparison against everything more detailed than it.
 */
enum class EKBVEWorldWallDetail : uint8
{
	/** Panels, the reveals inside every opening, and the lintels and sills. */
	Full,

	/** Panels and reveals. The trim around the openings is gone. */
	Plain,

	/**
	 * One slab. The openings are gone with it.
	 *
	 * Deliberately not a subset of the levels above, which every other tier in
	 * this plugin is. A wall is mostly wall, and past a few hundred metres an
	 * unlit window is a few pixels the same value as the brick around it -- so
	 * what filling the openings changes is the triangle count and not the
	 * picture. Keeping them would mean carrying the whole decomposition to build
	 * holes nobody can see, which is the cost this tier exists to avoid.
	 */
	Solid,
};

/**
 * Where one wall stands and how it joins the rest of its building.
 */
struct FKBVEWorldWallBuild
{
	/** The base centre line. Both ends share a Z: a building does not drape. */
	FVector Start = FVector::ZeroVector;
	FVector End = FVector::ZeroVector;

	/**
	 * How far around the building this wall's start already is.
	 *
	 * So the coursing carries around a corner instead of restarting at it. The
	 * caller accumulates the perimeter as it walks the footprint, and two walls
	 * that meet get UVs that agree at the join.
	 */
	float UOffset = 0.0f;

	/**
	 * How far below the base the plinth is taken.
	 *
	 * The footprint is levelled to one height and the ground is not, so this is
	 * the drop to the lowest earth the wall passes over. Nothing is gained by
	 * being exact: too little leaves daylight under a corner, and too much is
	 * buried and costs a few triangles.
	 */
	float Embed = 0.0f;

	bool bPlinth = true;

	/**
	 * Which of the wall's own edges are open to the air.
	 *
	 * A wall built by itself is capped all round. One built as part of something
	 * is not: the top of a storey and the underside of the storey above it are
	 * the same plane, so capping both puts two coincident faces there and the
	 * building z-fights in a band around every upper floor. The ends are the same
	 * argument at a corner, where each wall's cap is buried inside the next.
	 */
	bool bCapTop = true;
	bool bCapBottom = true;
	bool bCapEnds = true;
};

struct KBVEWORLDCORE_API FKBVEWorldWall
{
	/**
	 * The rectangles of solid wall a run with these openings leaves.
	 *
	 * Split out from building the geometry because it is the part worth testing:
	 * everything a wall is depends on this decomposition being right, and it can
	 * be checked as arithmetic rather than by counting triangles. Openings are
	 * snapped to the coursing and clamped into the wall here, so a caller may
	 * seed them freely and get something a mason could have built.
	 */
	static void Panels(const FKBVEWorldWallParams& Wall, float Length,
		TArrayView<const FKBVEWorldWallOpening> Openings, EKBVEWorldWallDetail Detail,
		TArray<FKBVEWorldWallPanel>& OutPanels, TArray<FKBVEWorldWallOpening>& OutOpenings);

	/**
	 * Build one wall into a mesh.
	 *
	 * Appends, so every wall of a building -- and every building in a chunk --
	 * shares one section and one draw call. That is the whole reason a village is
	 * affordable: a town is not a thousand actors, it is one mesh per chunk that
	 * a thousand walls were written into.
	 */
	static void Build(const FKBVEWorldWallParams& Wall, const FKBVEWorldWallBuild& In,
		TArrayView<const FKBVEWorldWallOpening> Openings, EKBVEWorldWallDetail Detail,
		FKBVEWorldRibbonMesh& Out);

	/**
	 * The triangle of wall above the plate, under a gable roof's rake.
	 *
	 * Masonry, not roof, which is the whole reason it lives here: a gable end is
	 * the wall carried up to meet the slopes, and built anywhere else it would
	 * restart the coursing at the eaves -- a seam straight across the top of the
	 * building, in the one place the wall is most plainly one surface.
	 *
	 * Inset is how far in from each end the triangle starts, because the roof
	 * slab has thickness: its underside dips below the plate at the wall line, so
	 * masonry taken all the way to the corner would come up through the slope it
	 * is supposed to be meeting. Apex is the height above the plate at the middle.
	 */
	static void Gable(const FKBVEWorldWallParams& Wall, const FKBVEWorldWallBuild& In, float Apex,
		float Inset, FKBVEWorldRibbonMesh& Out);
};
