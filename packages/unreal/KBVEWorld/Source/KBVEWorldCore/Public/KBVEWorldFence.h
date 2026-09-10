#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldHeightfieldParams.h"
#include "KBVEWorldIvy.h"
#include "KBVEWorldPart.h"
#include "KBVEWorldRoadField.h"
#include "KBVEWorldRoadGraph.h"

#include "KBVEWorldFence.generated.h"

/** What a run of fence is built out of, chosen per run by the seed. */
UENUM()
enum class EKBVEWorldFenceStyle : uint8
{
	/** Posts with two horizontal rails between them. */
	PostAndRail,

	/** Posts and rails with uprights closing the gap between them. */
	Picket,

	/** A low dry-stone wall, no posts. */
	Wall,
};

/**
 * Shape of the fences that run alongside a road.
 *
 * Aesthetic rather than meaningful: a fence here does not enclose anything and
 * is not a hint that something is nearby. What it does is give a road an edge,
 * so a route across open ground reads as a road through a place rather than a
 * strip of different ground -- which is why it is worth having and also why it
 * is worth leaving out most of the time. A fence down every road is a corridor.
 *
 * Everything here is a box, because everything here is instanced. Hardware --
 * the hinges, the fasteners, the caps and the trim -- is deliberately absent: at
 * the size a roadside fence occupies on screen none of it resolves, and each one
 * would be an instance count that grows with the world rather than with what is
 * being looked at. That detail belongs in the material.
 */
USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldFenceParams
{
	GENERATED_BODY()

	/**
	 * How much of the network carries a fence at all, as a fraction.
	 *
	 * The point of the feature is the contrast: a fence reads as somewhere
	 * someone bothered, and it only reads that way while most of the road is
	 * bare. At one this is a corridor from one end of the world to the other.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float Coverage = 0.35f;

	/** How likely a run that exists is stone rather than timber. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float StoneChance = 0.25f;

	/** How likely a timber run closes its gaps with pickets. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float PicketChance = 0.35f;

	/** Shortest and longest a single run may be, in world units. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence", meta = (ClampMin = "100.0"))
	float MinRunLength = 1200.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence", meta = (ClampMin = "100.0"))
	float MaxRunLength = 4200.0f;

	/**
	 * How far off the road's centre line a fence stands.
	 *
	 * Outside the graded shoulder, or the posts are standing in the road surface
	 * the terrain was levelled for. Defaulted clear of the road's own
	 * CutFlatHalfWidth rather than derived from it, so that widening the road
	 * does not silently walk the fences into it -- the two are checked against
	 * each other at build time instead.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence", meta = (ClampMin = "0.0"))
	float Offset = 430.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Post", meta = (ClampMin = "50.0"))
	float PostSpacing = 260.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Post", meta = (ClampMin = "1.0"))
	float PostWidth = 22.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Post", meta = (ClampMin = "1.0"))
	float PostHeight = 150.0f;

	/**
	 * How much stouter the posts at the ends of a run are.
	 *
	 * A run that starts and stops on the same post it uses in the middle reads as
	 * having been cut off rather than built to a length. This is most of what
	 * makes a run look deliberate, and it costs nothing: the same box, scaled.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Post", meta = (ClampMin = "1.0"))
	float EndPostScale = 1.6f;

	/** How far a post is sunk into the ground, so none of them float. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Post", meta = (ClampMin = "0.0"))
	float PostEmbed = 45.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Rail", meta = (ClampMin = "1.0"))
	float RailThickness = 14.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Rail", meta = (ClampMin = "1.0"))
	float RailDepth = 26.0f;

	/**
	 * Where the rails sit up the post, as fractions of its height.
	 *
	 * Two of them, because one reads as a barrier someone abandoned halfway.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Rail",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float LowerRailHeight = 0.38f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Rail",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float UpperRailHeight = 0.82f;

	/**
	 * Board along the bottom of a run, closing the gap to the ground.
	 *
	 * Worth more here than it is on a real fence. A fence is draped over ground
	 * that was never levelled for it, so between two posts on a dip the rails
	 * bridge a hollow and the run is lit from underneath -- daylight where a
	 * fence should be meeting the earth. The board follows the ground rather than
	 * the rails and closes it. Zero leaves the gap open.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Rail", meta = (ClampMin = "0.0"))
	float KickboardHeight = 34.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Picket", meta = (ClampMin = "1.0"))
	float PicketSpacing = 46.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Picket", meta = (ClampMin = "1.0"))
	float PicketWidth = 18.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Wall", meta = (ClampMin = "1.0"))
	float WallHeight = 105.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Wall", meta = (ClampMin = "1.0"))
	float WallThickness = 60.0f;

	/** How long each course of wall is before it steps to follow the ground. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Wall", meta = (ClampMin = "20.0"))
	float WallSegmentLength = 150.0f;

	/**
	 * Steepest ground a fence will stand on, as a rise over its post spacing.
	 *
	 * Not a physical limit so much as a look: a fence marching straight up a
	 * bank reads as a texture laid on the hill rather than as something built,
	 * and the rails between two posts at very different heights leave a wedge of
	 * daylight no kickboard closes. A run gives up where the ground does.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence", meta = (ClampMin = "0.0"))
	float MaxSlope = 0.55f;

	/**
	 * Passes of easing over the line the rails ride.
	 *
	 * A run whose every post sits exactly where the ground is reads as a chain of
	 * chords with a kink at each post, because that is what it is. Easing the line
	 * lets a run arch over a rise the way a built fence does, while the posts
	 * still reach the ground under them -- the same filter, and the same pinned
	 * ends, that the road's own profile is smoothed with.
	 *
	 * Zero puts every post back on the raw ground.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence", meta = (ClampMin = "0"))
	int32 ProfileSmoothPasses = 6;

	/**
	 * How far past a front door on each side a run stands off.
	 *
	 * A fence runs between the houses and the carriageway, so without this it is
	 * built straight across every doorstep in the village -- posts through the
	 * steps and a rail at shin height across the one place anybody walks. The
	 * opening is the door plus this either side, which wants to be wide enough
	 * for the flight as well as the leaf.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence", meta = (ClampMin = "0.0"))
	float GateClearance = 130.0f;

	/**
	 * Shortest piece a gateway may leave behind, as a multiple of post spacing.
	 *
	 * A run cut close to its own end leaves a stub of one or two posts standing
	 * beside a gap, which reads as a fence that fell down rather than one built
	 * around a gate. Below this the piece is dropped and the run simply stops
	 * short of the house.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence", meta = (ClampMin = "0.0"))
	float MinPieceSpans = 2.0f;

	/** What grows up the posts, for the runs the seed lets it grow on. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fence|Ivy")
	FKBVEWorldIvyParams Ivy;
};

/**
 * A stretch of one side of a road that must be left open.
 *
 * A gateway rather than a gate: what is built here is the absence of fence and
 * the two stout posts a run already puts at its ends, which is what a field gate
 * looks like with the gate open. Hanging a leaf across it would be a closed gate
 * over the path from the road to the front door of every house in the village.
 */
struct FKBVEWorldFenceGate
{
	/** Which side of the road, matching a run's own sign. */
	float Side = 1.0f;

	/** Distances along the edge's polyline, the same measure a run uses. */
	float Begin = 0.0f;
	float End = 0.0f;
};

/** The boxes one stretch of roadside fence is built from, split by material. */
struct FKBVEWorldFenceMesh
{
	TArray<FKBVEWorldPart> Wood;
	TArray<FKBVEWorldPart> Stone;

	/**
	 * Whatever climbed the posts, kept apart from them.
	 *
	 * Boxes and cards are two meshes and two materials, so they were never going
	 * to share a bucket -- and the ivy is placed on the post rather than being
	 * part of it, which is what lets a run stand its posts at one tier and its
	 * plant at another.
	 */
	TArray<FKBVEWorldIvySprig> Ivy;

	/** The runners those leaves are set on, which are triangles rather than cards. */
	FKBVEWorldRibbonMesh Vines;
};

/**
 * How much of a run is worth standing up at the range it is seen from.
 *
 * Ordered cheapest last, so a comparison against a tier is a comparison against
 * everything more detailed than it.
 */
enum class EKBVEWorldFenceDetail : uint8
{
	/** Everything: posts, rails, whatever closes the gaps, and the kickboard. */
	Full,

	/** Posts and rails. The infill and the kickboard are gone. */
	Framed,

	/** Posts only, which at range is all a fence line is anyway. */
	Posts,
};

/**
 * One stretch of fence, as the stretch of road it runs beside.
 *
 * Deliberately not the posts. A run is what the seed decides and what the world
 * streams, and it is a handful of numbers -- so a fence that is a thousand posts
 * long is still one of these, and the posts are derived from it only when
 * something is close enough to see them.
 */
struct FKBVEWorldFenceRun
{
	/** Which side of the road, as the sign of the lateral offset. */
	float Side = 1.0f;

	/** Where the run starts and ends, as distance along the edge's polyline. */
	float Begin = 0.0f;
	float End = 0.0f;

	EKBVEWorldFenceStyle Style = EKBVEWorldFenceStyle::PostAndRail;

	/** Its own stream, so a run's jitter does not move when a neighbour changes. */
	int32 Seed = 0;
};

struct KBVEWORLDCORE_API FKBVEWorldFence
{
	/**
	 * Which stretches of one road edge carry a fence.
	 *
	 * Derived like everything else the world is made of: a pure function of the
	 * seed, the edge and the distance along it, so both ends of a connection
	 * agree on where a fence is without a byte crossing the wire and a chunk
	 * rebuilt an hour later is the same fence.
	 *
	 * The spans a bridge was built over are passed in so a fence can stop at
	 * them. A crossing carries its own handrails, and marching a fence over one
	 * would put posts through the deck and into the river underneath it.
	 *
	 * Cheap on purpose, and free of the ground: this is what a chunk does for
	 * every edge it owns whether or not anything is close enough to look, so it
	 * samples no heightfield and stands up no geometry.
	 */
	static void FindRuns(const FKBVEWorldFenceParams& Fence, const FKBVEWorldRoadParams& Road,
		int32 Seed, const FIntPoint& Edge, const TArray<FVector>& Path,
		const TArray<FKBVEWorldRoadSpan>& Spans, TArray<FKBVEWorldFenceRun>& OutRuns);

	/**
	 * Cut the gateways out of a set of runs.
	 *
	 * Separate from FindRuns because the two know different things. Where a run
	 * goes is a pure function of the seed and costs nothing; where a front door
	 * goes is only known once a plot has been sited, which needs the ground --
	 * a house may be moved along the road to find level ground or refused
	 * outright. Folding that into FindRuns would make the cheap half pay for the
	 * expensive one every time a chunk asks where its fences are.
	 *
	 * A run may be cut in two, shortened, or removed entirely. Pieces too short
	 * to read as built are dropped rather than left standing.
	 */
	static void Gates(const FKBVEWorldFenceParams& Fence,
		TArrayView<const FKBVEWorldFenceGate> Gates, TArray<FKBVEWorldFenceRun>& Runs);

	/**
	 * Stand one run up as boxes, at the detail asked for.
	 *
	 * This is the half that touches the ground, so it is also the expensive half
	 * -- every post is a heightfield sample and a road field lookup. Kept apart
	 * from the decision of where runs are for exactly that reason.
	 */
	static void BuildRun(const FKBVEWorldFenceParams& Fence, const FKBVEWorldRoadParams& Road,
		const FKBVEWorldHeightfieldParams& Shape, int32 Seed, const FKBVEWorldRoadField* Field,
		const TArray<FVector>& Path, const FKBVEWorldFenceRun& Run,
		EKBVEWorldFenceDetail Detail, FKBVEWorldFenceMesh& Out);

	/**
	 * Where a distance along a polyline lands, ignoring the ground.
	 *
	 * For describing a run rather than building one: what a run covers is enough
	 * to decide how much of it is worth standing up, and answering that should
	 * not cost a heightfield sample.
	 */
	static FVector PointAt(const TArray<FVector>& Path, float Distance);
};
