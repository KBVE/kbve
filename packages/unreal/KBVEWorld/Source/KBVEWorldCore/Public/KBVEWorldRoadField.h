#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldHeightfieldParams.h"
#include "KBVEWorldRoadGraph.h"

/**
 * The road network as a field the ground can be levelled against.
 *
 * Roads are graded into the terrain rather than laid on top of it, for two
 * reasons that turn out to be the same reason. A road draped over rolling ground
 * rides every bump, which is not what a road does; and the terrain is drawn at a
 * coarser stride the further it is from the viewer, so a surface draped onto the
 * true heightfield stands off the surface actually being rendered -- by 79 uu on
 * average and 531 uu at worst on the outermost ring. Flattening a corridor fixes
 * both at once: a flat corridor is reconstructed correctly at any stride, so the
 * road stops floating however far away it is.
 *
 * The corridor is deliberately much wider than the road. A cut only as wide as
 * the surface would fall between the samples of a coarse patch and never be seen
 * at distance, which is exactly where the floating was worst.
 *
 * This is NOT part of the cross-language heightfield contract. FKBVEWorldHeightfield
 * stays the shared ground that the Rust server and the web client also derive;
 * this is a layer over it that only Unreal currently applies, so a pawn standing
 * in a cutting is up to the cut depth away from where a server using the shared
 * function alone would put it. Nothing consumes that function outside Unreal
 * yet, which is what makes the split affordable rather than correct -- port this
 * alongside it before anything else arbitrates movement.
 */
class KBVEWORLDCORE_API FKBVEWorldRoadField
{
public:
	FKBVEWorldRoadField(const FKBVEWorldRoadParams& InRoad, const FKBVEWorldHeightfieldParams& InShape,
		int32 InSeed);

	/**
	 * Ground height at a world position, levelled toward any road corridor over
	 * it. Returns Base untouched where there is no road.
	 */
	float Level(float Base, float WorldX, float WorldY) const;

	/** Routes anything overlapping the box that has not been routed yet. */
	void EnsureCovers(const FVector2D& Min, const FVector2D& Max) const;

	/** The road centre lines, for whatever wants to lay a surface on them. */
	const TArray<FVector>* FindEdge(const FIntPoint& Chunk, int32 Step) const;

	/**
	 * How much of this point is road surface, 0 to 1.
	 *
	 * Painted into the terrain rather than laid over it. A road drawn as its own
	 * strip is a second surface parallel to the first, and every difference
	 * between the two -- the offset that stops them z-fighting, the interpolation
	 * error across a quad, the coarser stride a distant patch is drawn at -- is a
	 * gap you can see under it. There is nothing to float when the road is the
	 * terrain triangle.
	 */
	float SurfaceWeight(float WorldX, float WorldY) const;

	/** Half the carriageway width, for callers deciding how finely to sample. */
	float GetSurfaceHalfWidth() const { return Road.RoadWidth * 0.5f; }

	/** Nearest corridor to a point: distance, its levelled height, its weight. */
	bool Probe(float WorldX, float WorldY, float& OutDistance, float& OutZ, float& OutWeight) const;

	bool Matches(const FKBVEWorldRoadParams& InRoad, int32 InSeed) const;

private:
	struct FSegment
	{
		FVector2D A;
		FVector2D B;
		float ZA;
		float ZB;
		// How far the corridor reaches out past each end. A full corridor width
		// where the run carries on into a junction, and much less where it stops
		// at an abutment and the ground beyond it is the river.
		float ReachA;
		float ReachB;
	};

	void RouteChunk(const FIntPoint& Chunk) const;
	// Reaches are world units, not flags: a cap has to be small against the span
	// it abuts, and the spans differ by an order of magnitude across a network.
	void AddPolyline(const TArray<FVector>& Points, float StartReach, float EndReach) const;

	/**
	 * Distance to a corridor, with overshoot past a capped end counted at the
	 * rate that end reaches out at.
	 *
	 * Sideways it is the plain distance to the segment. Past an end it is scaled,
	 * so a tight cap shrinks the corridor along its axis without narrowing it --
	 * and continuously, since the scaling only applies to overshoot, which is
	 * zero at the end itself.
	 */
	float CorridorDistance(const FVector2D& P, const FSegment& Segment, float& OutT) const;

	FKBVEWorldRoadParams Road;
	FKBVEWorldHeightfieldParams Shape;
	int32 Seed;
	float CellSize;

	// Built on demand as patches ask about ground the field has not seen yet, so
	// an edge is routed once for the whole window rather than once per patch that
	// happens to touch it -- which at nine chunk-pairs per patch and a Viterbi
	// pass each was the whole cost of this.
	// Keyed (chunk x, chunk y, which of the chunk's two forward edges).
	mutable TMap<FIntVector, TArray<FVector>> Edges;
	mutable TSet<FIntPoint> Routed;
	mutable TArray<FSegment> Segments;
	mutable TMap<FIntPoint, TArray<int32>> Buckets;
};
