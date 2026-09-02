#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldHeightfieldParams.h"

#include "KBVEWorldRoadGraph.generated.h"

/**
 * Shape of the road network.
 *
 * The network is derived, never authored: one node per chunk and one edge to
 * each of that chunk's two forward neighbours, so the graph tiles the plane with
 * no global solve and no seams to reconcile. An edge is a pure function of
 * (seed, the two chunk coordinates), and exactly one chunk owns it, so two
 * chunks can never disagree about where a road runs -- which is the failure the
 * obvious "route from my node to my neighbour's" design walks straight into when
 * the two ends are built in different frames.
 */
USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldRoadParams
{
	GENERATED_BODY()

	/** Heightfield tiles per chunk edge. One tile is WorldUnitsPerTile across. */
	/**
	 * Spacing between road nodes, in tiles.
	 *
	 * Deliberately several terrain chunks rather than one. A node per terrain
	 * chunk means four roads meeting every 128 tiles, which from the air is a
	 * lattice laid over the landscape rather than a road network -- the thing
	 * that makes it read as roads is that most of the world does not have one.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road", meta = (ClampMin = "8"))
	float TilesPerChunk = 384.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road", meta = (ClampMin = "1.0"))
	float WorldUnitsPerTile = 100.0f;

	/**
	 * How far a node may sit from its chunk's centre, as a fraction of the chunk.
	 * Zero puts every node on a lattice, which reads as a grid from the air.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road", meta = (ClampMin = "0.0", ClampMax = "0.45"))
	float NodeJitter = 0.3f;

	/** Points along one edge. Also the resolution the route can turn at. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Routing", meta = (ClampMin = "4", ClampMax = "128"))
	int32 SamplesPerEdge = 36;

	/**
	 * Lateral positions considered per sample.
	 *
	 * Routing is a Viterbi pass over this corridor rather than an A* over open
	 * ground: the corridor is what bounds the work to a fixed cost per edge, and
	 * the pass is still globally optimal inside it. Widening this is what lets a
	 * road detour around a hill instead of climbing it.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Routing", meta = (ClampMin = "3", ClampMax = "63"))
	int32 LateralSlots = 15;

	/** Half-width of the corridor the route may wander inside, in tiles. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Routing", meta = (ClampMin = "0.0"))
	float CorridorTiles = 60.0f;

	/** Cost per world unit of climb. The dominant term: roads follow contours. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Routing", meta = (ClampMin = "0.0"))
	float SlopeWeight = 26.0f;

	/**
	 * Cost of standing in the river, per sample at full mask.
	 *
	 * High but finite, deliberately. Infinite would make a road refuse to cross
	 * at all and strand half the network on the far bank; finite means it crosses
	 * where crossing is cheapest -- narrow, and square to the channel -- which is
	 * what makes the bridges look sited rather than scattered.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Routing", meta = (ClampMin = "0.0"))
	float RiverWeight = 12000.0f;

	/** Cost per world unit travelled, which is what keeps detours from being free. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Routing", meta = (ClampMin = "0.0"))
	float LengthWeight = 1.0f;

	/**
	 * Cost per world unit of sideways movement between one sample and the next.
	 *
	 * Without it nothing opposes a route stepping across the corridor and back:
	 * the extra distance of a lateral step is second-order next to the climb it
	 * saves, so the cheapest path zigzags between slots and the road arrives
	 * looking drunk. This is the term that buys long straights and deliberate
	 * curves rather than constant small corrections.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Routing", meta = (ClampMin = "0.0"))
	float TurnWeight = 14.0f;

	/**
	 * Fraction of candidate edges that actually carry a road.
	 *
	 * Every node connecting to both its forward neighbours makes a complete grid.
	 * Dropping some of them is what leaves the network with junctions, through
	 * routes and dead ends instead of a uniform mesh. Deterministic in the pair,
	 * so both would-be owners agree it is not there.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Routing", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float EdgeDensity = 0.62f;

	/**
	 * Corner-cutting passes over the finished route.
	 *
	 * The router works on a lattice of discrete lateral slots, so its output is
	 * piecewise linear with a visible joint at every sample however good the path
	 * is. Smoothing is what turns those joints into the curve the cost function
	 * was already describing.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Routing", meta = (ClampMin = "0", ClampMax = "4"))
	int32 SmoothPasses = 2;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Surface", meta = (ClampMin = "1.0"))
	float RoadWidth = 520.0f;

	/**
	 * Spans across the road's width. See FKBVEWorldRibbonParams::LateralSegments
	 * -- a road is wide enough that one span chords over the ground it crosses.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Surface", meta = (ClampMin = "1", ClampMax = "16"))
	int32 RoadLateralSegments = 6;

	/**
	 * Longest quad along the road before it is split. Bounds how far the surface
	 * can chord across ground that moves between two route samples.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Surface", meta = (ClampMin = "0.0"))
	float RoadMaxSegmentLength = 110.0f;

	/** How far the road surface fades out past its edge. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Surface", meta = (ClampMin = "1.0"))
	float RoadSurfaceFeather = 90.0f;

	/** World units of road per texture tile. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Surface", meta = (ClampMin = "1.0"))
	float RoadTileLength = 520.0f;


	/**
	 * Ground within this of the centre line is levelled dead flat. Wider than the
	 * painted surface, so the road has a verge rather than a cut line at its edge.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Cut", meta = (ClampMin = "0.0"))
	float CutFlatHalfWidth = 340.0f;

	/**
	 * Where the cut has faded back into untouched ground.
	 *
	 * Much wider than the road, on purpose. Distant terrain is drawn at a coarse
	 * stride, and a corridor narrower than that stride falls between its samples
	 * and is never reconstructed -- which is precisely where a draped road stood
	 * off the ground worst. A cutting this wide survives every LOD the patch can
	 * be drawn at.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Cut", meta = (ClampMin = "0.0"))
	float CutHalfWidth = 1500.0f;

	/**
	 * Passes of moving average over the centre line's height.
	 *
	 * The route follows contours in plan but still takes the ground's own relief
	 * in section, so the levelled corridor would roll with every hummock it
	 * crosses. Smoothing the profile first is what puts the road into a cutting
	 * on the rises and on an embankment through the dips, which is the shape that
	 * reads as built rather than as painted on.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Cut", meta = (ClampMin = "0", ClampMax = "32"))
	int32 ProfileSmoothPasses = 8;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Cut")
	bool bCutTerrain = true;

	/** River mask above which the road is over water and wants a deck instead. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Bridge", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float BridgeMaskThreshold = 0.1f;

	/** Extra ground either side of a crossing that the deck reaches back onto. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Road|Bridge", meta = (ClampMin = "0.0"))
	float BridgeMarginTiles = 3.0f;
};

/** A run of path samples, inclusive of both ends. */
struct FKBVEWorldRoadSpan
{
	int32 Begin = 0;
	int32 End = 0;

	int32 Num() const { return End - Begin + 1; }
};

struct KBVEWORLDCORE_API FKBVEWorldRoadGraph
{
	/**
	 * Whether the pair of nodes is joined by a road at all.
	 *
	 * Hashed from both endpoints in a fixed order, so the two chunks that could
	 * own the edge always agree about whether it exists.
	 */
	static bool HasEdge(const FKBVEWorldRoadParams& Road, int32 Seed, const FIntPoint& A,
		const FIntPoint& B);

	/**
	 * Tile-space position of the node a chunk owns, pushed out of the river if
	 * the jitter dropped it in one.
	 *
	 * Without that push a node in mid-channel makes every edge meeting there a
	 * bridge that ends over water, with no dry ground for an abutment to land on
	 * -- the road arrives at a deck that stops in the river.
	 */
	static FVector2D NodeTile(const FKBVEWorldRoadParams& Road,
		const FKBVEWorldHeightfieldParams& Shape, int32 Seed, const FIntPoint& Chunk);

	/**
	 * Route the edge between two chunk nodes, in world units with Z on the
	 * ground. Deterministic in (Seed, A, B): the same edge asked for twice is the
	 * same polyline, so nothing has to be cached or replicated.
	 */
	static void RouteEdge(const FKBVEWorldRoadParams& Road, const FKBVEWorldHeightfieldParams& Shape,
		int32 Seed, const FIntPoint& A, const FIntPoint& B, TArray<FVector>& OutWorld);

	/**
	 * Runs of the path that are over the river, widened onto dry ground either
	 * side so a deck has banks to land on.
	 */
	static void FindRiverSpans(const FKBVEWorldRoadParams& Road, const FKBVEWorldHeightfieldParams& Shape,
		int32 Seed, const TArray<FVector>& Path, TArray<FKBVEWorldRoadSpan>& OutSpans);
};
