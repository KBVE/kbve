#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldPart.h"
#include "KBVEWorldRibbon.h"

#include "KBVEWorldIvy.generated.h"

struct FKBVEWorldWallFrame;
struct FKBVEWorldWallPanel;

/**
 * How ivy takes a surface: as stems that walk it, and leaves along them.
 *
 * Scattering leaves over a wall and scattering them along a stem look nothing
 * alike, and the difference is not density. A plant grows from somewhere to
 * somewhere else, so its leaves arrive in lines with bare wall between them --
 * which is the thing that reads as ivy rather than as a green rectangle.
 */
USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldIvyParams
{
	GENERATED_BODY()

	/**
	 * How much of the world's masonry carries ivy at all, as a fraction.
	 *
	 * The same argument the fences make for their own coverage: ivy on one wall
	 * in three says the village has been standing a while, and ivy on all of
	 * them says nothing at all.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float Coverage = 0.5f;

	/** Stems per metre across the stretch of wall a plant has taken. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy", meta = (ClampMin = "0.0"))
	float Stems = 3.2f;

	/**
	 * How much of a surface's width one plant takes, as a fraction.
	 *
	 * A plant rooted in one place, not a coat of paint: a wall with ivy has it
	 * over part of itself and bare brick beside it.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy",
		meta = (ClampMin = "0.05", ClampMax = "1.0"))
	float SpreadMin = 0.34f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy",
		meta = (ClampMin = "0.05", ClampMax = "1.0"))
	float SpreadMax = 0.72f;

	/**
	 * How far up its surface a climbing stem reaches, as a fraction of the height.
	 *
	 * A ceiling and not a band: ivy climbs from the ground, so what this decides
	 * is where the plant runs out, not where it starts.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float Climb = 0.72f;

	/**
	 * How far back down a wall the growth over its head hangs, as a fraction.
	 *
	 * Ivy that reached a roof does not stop at the gutter -- it goes over the
	 * eaves and comes back down the face, which is why an old wall reads as
	 * green at the top as well as at the bottom. Zero leaves the eaves bare.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float Drape = 0.45f;

	/** How many of a wall's stems hang from its head rather than climb its foot. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float DrapeShare = 0.4f;

	/** How far a stem grows between one leaf node and the next, in world units. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy", meta = (ClampMin = "1.0"))
	float Step = 11.0f;

	/** How far a stem may wander across the surface per step, in world units. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy", meta = (ClampMin = "0.0"))
	float Wander = 4.5f;

	/**
	 * How many leaves each sprig mesh carries.
	 *
	 * Set from whatever is building those meshes rather than authored: it decides
	 * how far apart the sprigs are set on a runner, and a placement that spaced
	 * them for three leaves while the mesh held four would lay them over each
	 * other. How far apart the leaves within one are is the mesh's own business,
	 * and it is a fraction of the leaf -- so a plant with bigger leaves sets them
	 * further apart, which is what a bigger plant does.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy", meta = (ClampMin = "1"))
	int32 LeafCluster = 3;

	/** How far apart leaves sit on a stem, as a fraction of their own height. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy", meta = (ClampMin = "0.05"))
	float LeafGap = 0.52f;

	/** How likely a node throws a side shoot, which grows no shoots of its own. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float BranchChance = 0.09f;

	/** Width of a stem at its base, in world units. Tapers to its tip. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy", meta = (ClampMin = "0.1"))
	float StemWidth = 3.4f;

	/** World units of stem per tile of whatever material draws it. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy", meta = (ClampMin = "1.0"))
	float StemTile = 60.0f;

	/** Longest side of one leaf, in world units. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy", meta = (ClampMin = "1.0"))
	float SizeMin = 26.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy", meta = (ClampMin = "1.0"))
	float SizeMax = 44.0f;

	/**
	 * How far off the face a leaf stands.
	 *
	 * Small, and not zero: a card coplanar with the wall it is held against
	 * z-fights along its whole length, which is the one artefact a masked plant
	 * cannot hide. The stem sits at half of it, so the leaves stand off their
	 * own stem rather than through it.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy", meta = (ClampMin = "0.0"))
	float Proud = 2.5f;

	/** How far a leaf may lean out of the surface plane, in degrees. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy",
		meta = (ClampMin = "0.0", ClampMax = "80.0"))
	float Lean = 26.0f;

	/**
	 * How many leaf meshes the placement has to choose between.
	 *
	 * Chosen between, not drawn from: one plant wears one leaf, so this is the
	 * spread across a village rather than across a wall. Set from the sheet
	 * rather than authored, and deliberately small -- a dozen scans of different
	 * plants read as a collection whichever way they are dealt out.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy", meta = (ClampMin = "1"))
	int32 Variants = 3;

	/** Ivy on a fence, which is a different plant's worth: a post is not a wall. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ivy",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float PostCoverage = 0.3f;
};

/**
 * One leaf, as the transform that stands it on a surface.
 *
 * Not a mesh. A leaf is instanced, and which of the variant meshes it is drawn
 * with is the index it carries -- so a whole village's ivy is a few arrays of
 * transforms and a handful of buckets, in the way the fence posts already are.
 */
struct FKBVEWorldIvySprig
{
	FVector Centre = FVector::ZeroVector;

	/** X across the leaf, Z along the stem, and -Y out of the surface. */
	FQuat Rotation = FQuat::Identity;

	/** Longest side, in world units. */
	float Size = 32.0f;

	int32 Variant = 0;
};

/**
 * A flat face something can grow on, in the units the growth is walked in.
 *
 * One struct for a wall and for the side of a fence post, because to a plant
 * they are the same thing: a rectangle, a way out of it, and which parts of it
 * are solid. Keeping the walk ignorant of which it was handed is what stops the
 * post growing a second, subtly different ivy from the wall's.
 */
struct FKBVEWorldIvyFace
{
	/** The corner the face is measured from: u along Right, v along Up. */
	FVector Origin = FVector::ZeroVector;

	/**
	 * The height the panels are measured at, and where the wall's own foot is.
	 *
	 * A plant does not start at the bottom of the masonry, it comes out of the
	 * earth -- so the face is allowed to run below this, over whatever footing
	 * the wall stands on and into the ground. Below it there are no openings to
	 * miss and no leaves worth setting: what is down there is stem.
	 */
	float Base = 0.0f;

	/**
	 * The top of the footing, and how far it stands proud of the face above it.
	 *
	 * A plinth is a wider band around the foot of a wall, so a runner crossing
	 * onto it has to step out by the overhang or it spends the last hand of its
	 * descent inside the stone.
	 */
	float Lip = 0.0f;
	float LipStand = 0.0f;

	FVector Right = FVector::ForwardVector;
	FVector Up = FVector::UpVector;
	FVector Norm = FVector::RightVector;

	float UMin = 0.0f;
	float UMax = 0.0f;
	float VMin = 0.0f;
	float VMax = 0.0f;

	/** How far out of the face's own plane the plant is held. */
	float Stand = 0.0f;

	FVector At(float U, float V, float T) const
	{
		return Origin + Right * U + Up * V + Norm * T;
	}

	/** How far out of the face the plant is held at this height. */
	float StandAt(float V) const
	{
		return V < Lip ? Stand + LipStand : Stand;
	}
};

/**
 * What a wall stands on, for the stretch of plant below its foot.
 *
 * Zero everywhere is a wall growing straight out of the ground with nothing
 * around its base, which is what an upper storey is: there is no footing up
 * there and nothing under it to crawl down to.
 */
struct FKBVEWorldIvyFooting
{
	/** How far below the wall's foot the plant may run, in world units. */
	float Depth = 0.0f;

	/** Height of the footing above that foot, and how far it stands proud. */
	float Lip = 0.0f;
	float Stand = 0.0f;
};

/**
 * Where ivy grows on a thing that has already been built.
 *
 * Pure arithmetic over surfaces somebody else decided, which is what makes it
 * testable and what keeps it out of the mesh builders: a wall knows its panels
 * and a fence knows its posts, and neither has any business also knowing how a
 * plant climbs.
 */
struct KBVEWORLDCORE_API FKBVEWorldIvy
{
	/**
	 * Grow one plant over one face.
	 *
	 * Solids are the parts of the face a stem may cross, and an empty list means
	 * all of it. Stems that meet an opening try to go round it once and then give
	 * up, which is what ivy does at a window: it frames the hole rather than
	 * hanging over the glass.
	 */
	static void Face(const FKBVEWorldIvyParams& Ivy, const FKBVEWorldIvyFace& Face,
		TArrayView<const FKBVEWorldWallPanel> Solids, bool bClimb, bool bDrape, int64 Seed,
		TArray<FKBVEWorldIvySprig>& OutLeaves, FKBVEWorldRibbonMesh& OutStems,
		int32 Leaf = INDEX_NONE);

	/**
	 * One wall face of a building, from the frame the masonry was built in.
	 *
	 * Panels rather than the wall itself, because the panels are already the
	 * decomposition that excludes the openings: ivy placed over a window is ivy
	 * hanging in the glass, and the wall has done that subtraction once already.
	 *
	 * Which leaf this wall's plant wears is the caller's to fix where a building
	 * is meant to carry one plant round its corners. Left alone, each wall
	 * chooses for itself.
	 */
	static void Wall(const FKBVEWorldIvyParams& Ivy, const FKBVEWorldWallFrame& Frame,
		TArrayView<const FKBVEWorldWallPanel> Panels, float Height, float Thickness,
		bool bClimb, bool bDrape, int64 Seed, TArray<FKBVEWorldIvySprig>& OutLeaves,
		FKBVEWorldRibbonMesh& OutStems, int32 Leaf = INDEX_NONE,
		const FKBVEWorldIvyFooting& Footing = FKBVEWorldIvyFooting());

	/**
	 * The four faces of one upright box.
	 *
	 * A fence post, which is the whole of what the fence hands over: rails and
	 * pickets carry nothing, because ivy holds to what it can root beside and a
	 * horizontal member two thirds of the way up a post has no ground under it.
	 */
	static void Post(const FKBVEWorldIvyParams& Ivy, const FKBVEWorldPart& Post, int64 Seed,
		TArray<FKBVEWorldIvySprig>& OutLeaves, FKBVEWorldRibbonMesh& OutStems);
};
