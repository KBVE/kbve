#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldHeightfieldParams.h"
#include "KBVEWorldPart.h"
#include "KBVEWorldRibbon.h"
#include "KBVEWorldRoadField.h"
#include "KBVEWorldRoadGraph.h"

#include "KBVEWorldBridge.generated.h"

/**
 * Shape of a bridge.
 *
 * A bridge is never placed: it is what a road does where it has to cross its own
 * river, and its two ends are samples of the road polyline rather than anchors
 * of their own. That is what makes the join seamless -- there is no second
 * opinion about where the road was.
 *
 * Its ends are read off the graded ground, not the raw heightfield. The road is
 * terrain now, levelled to a smoothed profile, so a deck that met the raw
 * surface would meet it at a height the road no longer has -- a step at both
 * abutments, on every crossing.
 */
USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldBridgeParams
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Deck", meta = (ClampMin = "1.0"))
	float DeckWidth = 560.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Deck", meta = (ClampMin = "1.0"))
	float DeckThickness = 44.0f;

	/**
	 * Rise at midspan, before clearance is taken into account.
	 *
	 * Cosmetic in shape but not in function: a dead flat deck between two banks
	 * of unequal height reads as a plank dropped across a ditch, and its
	 * underside ends up in the water on the low side.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Deck", meta = (ClampMin = "0.0"))
	float ArchHeight = 70.0f;

	/**
	 * Rise as a fraction of the crossing's own length, taken as a floor.
	 *
	 * A fixed rise is a fixed rise whatever it is spanning, so the same 70 uu
	 * that gives a short crossing a visible camber disappears into a long one --
	 * over two or three thousand units of deck it is a slope of one in forty, and
	 * the middle of the bridge reads as dead flat. Clearance cannot make up the
	 * difference either: the bed is far below the banks the road crosses at, so
	 * the solve below almost always asks for nothing.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Deck", meta = (ClampMin = "0.0"))
	float ArchSpanRatio = 0.055f;

	/**
	 * Hard ceiling on the rise.
	 *
	 * The clearance solve divides by the taper carrying the arch, so a sample
	 * near either end -- where the taper is small and the ground is the bank the
	 * deck is landing on -- can demand an arbitrarily large rise for a crossing
	 * that needs none. The divide is bounded now, and this is the backstop.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Deck", meta = (ClampMin = "0.0"))
	float MaxArchHeight = 260.0f;

	/**
	 * Water the deck must clear.
	 *
	 * The arch is raised until this holds rather than being trusted as given: a
	 * fixed rise clears a deep channel and grazes a shallow one, and a deck that
	 * grazes has nowhere to put a pier -- every support comes out shorter than it
	 * is worth building, and the crossing renders as a plank lying in a ditch.
	 *
	 * Demanded over the channel only, not over the whole span. The margins either
	 * side are approach, where the deck is meant to be coming down to meet the
	 * road; asking it to clear the banks it lands on is what made every bridge
	 * arch far higher than its crossing needed.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Deck", meta = (ClampMin = "0.0"))
	float MinClearance = 190.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Deck", meta = (ClampMin = "1.0"))
	float TileLength = 520.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Rail", meta = (ClampMin = "0.0"))
	float RailHeight = 115.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Rail", meta = (ClampMin = "1.0"))
	float RailThickness = 26.0f;

	/** How far in from the deck edge the rails sit. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Rail", meta = (ClampMin = "0.0"))
	float RailInset = 34.0f;

	/**
	 * Depth of the two girders carried under the deck.
	 *
	 * Swept along the deck's own line rather than boxed, so a crossing taken at
	 * an angle gets a frame that runs with it. An axis-aligned beam under a
	 * diagonal deck reads as scenery someone dropped there.
	 */
	/**
	 * Pieces the deck line is cut into between route samples.
	 *
	 * The route describes where a road goes, at a few hundred units a sample.
	 * That is the wrong resolution for a handrail: swept raw, a curve is a row of
	 * flats with a corner at every joint.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Deck", meta = (ClampMin = "1", ClampMax = "16"))
	int32 CurveSubdivisions = 5;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Frame", meta = (ClampMin = "0.0"))
	float GirderDepth = 80.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Frame", meta = (ClampMin = "1.0"))
	float GirderWidth = 64.0f;

	/** How far in from the deck edge each girder runs. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Frame", meta = (ClampMin = "0.0"))
	float GirderInset = 130.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Frame", meta = (ClampMin = "1.0"))
	float CrossBeamSpacing = 420.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Frame", meta = (ClampMin = "0.0"))
	float CrossBeamDepth = 56.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Frame", meta = (ClampMin = "1.0"))
	float CrossBeamWidth = 72.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Pier", meta = (ClampMin = "1.0"))
	float PierSpacing = 900.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Pier", meta = (ClampMin = "1.0"))
	float PierWidth = 170.0f;

	/** How far a pier is sunk into the ground it lands on, so none of them float. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Pier", meta = (ClampMin = "0.0"))
	float PierEmbed = 140.0f;

	/** Piers shorter than this are not built; the deck is already on the ground. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Pier", meta = (ClampMin = "0.0"))
	float MinPierHeight = 90.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Pier", meta = (ClampMin = "1.0"))
	float AbutmentWidth = 300.0f;

	/**
	 * How far inboard an abutment may be built up from before it gives up, as a
	 * fraction of the span.
	 *
	 * The deck leaves the ground gradually, so there is a stretch at each end
	 * carrying less than a pier's worth of clearance -- too little to be worth a
	 * support on its own, and exactly the stretch that was left as open air under
	 * the ramp. It is masonry all the way out instead. The bound is only there so
	 * a crossing whose deck never clears the ground does not fill its whole
	 * length with stone.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Pier", meta = (ClampMin = "0.0", ClampMax = "0.5"))
	float AbutmentReach = 0.35f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Pier", meta = (ClampMin = "1.0"))
	float StoneTileLength = 400.0f;
};

/**
 * How much of a crossing is worth building at the range it is seen from.
 *
 * A road chunk is rebuilt whenever the window moves, so the ring it sits in is
 * known before a single vertex exists -- which makes the cheapest LOD a
 * build-time decision rather than a runtime one. A procedural mesh section has
 * exactly one level of detail and no screen-size reduction of its own, so
 * anything not decided here is drawn in full at every distance.
 *
 * Only the frame and the curve refinement are dropped. Between them they are
 * most of a crossing's vertices and neither survives being a few pixels wide.
 * The deck, the rails and the supports are built at every ring: they are the
 * silhouette, and a bridge that loses its silhouette reads as a gap in the road.
 */
USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldBridgeLod
{
	GENERATED_BODY()

	/**
	 * Samples kept along the swept deck, against the shape's own subdivision.
	 *
	 * The deck line is refined at the shape's full rate whatever this says, and
	 * this thins the refined line before it is swept. That order is the whole of
	 * why the level is safe to change under a moving viewer: the route's length
	 * is what the abutment march walks and what the pier bays divide, so solving
	 * on a coarser line would stand the masonry somewhere else and the supports
	 * would jump as the ring changed. Thinning afterwards moves nothing.
	 *
	 * Both ends are kept, so the join at the abutment is the same geometry at
	 * every level and only the middle of the curve loses samples.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Lod",
		meta = (ClampMin = "1", ClampMax = "16"))
	int32 CurveSubdivisions = 5;

	/**
	 * Whether the girders and cross beams under the deck are built.
	 *
	 * How far the frame reaches is still solved when this is off, because that
	 * is what decides which bays are worth a pier -- dropping the frame changes
	 * what is drawn and never where a support stands. The supports rise to the
	 * deck rather than stopping under a frame that is not there, so the far
	 * level is a subset of the near one and nothing opens a gap under the deck.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Lod")
	bool bFrame = true;

	/**
	 * Whether the repeated boxes come back as transforms rather than triangles.
	 *
	 * The piers, the abutments and the cross beams are all a box somewhere, and a
	 * box is the one thing worth handing to an instanced mesh instead of building
	 * per chunk. Off, they are triangulated into the meshes below as before, which
	 * is what a caller with no mesh to instance needs.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Lod")
	bool bInstancedParts = false;
};

/** What a crossing stands or hangs is the same box anything else does. */
using FKBVEWorldBridgePart = FKBVEWorldPart;

/** Everything one crossing produces. */
struct FKBVEWorldBridgeMesh
{
	/**
	 * Wood and stone are separate meshes because they are separate materials,
	 * and a material change inside one procedural mesh section is not a thing --
	 * two sections is the cheapest form of the split.
	 */
	FKBVEWorldRibbonMesh Wood;
	FKBVEWorldRibbonMesh Stone;

	/**
	 * The supports as the boxes they were before they were triangulated.
	 *
	 * Filled whether or not the parts are instanced, because this is what the
	 * supports collide as: cooking a pier's twelve triangles buys nothing over
	 * the convex hull it already is.
	 */
	TArray<FBox> Blocks;

	/** The boxes to instance, when the level gave a mesh to instance them with. */
	TArray<FKBVEWorldBridgePart> StoneParts;
	TArray<FKBVEWorldBridgePart> WoodParts;
};

struct KBVEWORLDCORE_API FKBVEWorldBridge
{
	/** Build one crossing from the road polyline and the span that is over water. */
	static void Build(const FKBVEWorldBridgeParams& Bridge, const FKBVEWorldBridgeLod& Lod,
		const FKBVEWorldRoadParams& Road, const FKBVEWorldHeightfieldParams& Shape, int32 Seed,
		const FKBVEWorldRoadField* Field, const TArray<FVector>& Path,
		const FKBVEWorldRoadSpan& Span, FKBVEWorldBridgeMesh& Out);
};
