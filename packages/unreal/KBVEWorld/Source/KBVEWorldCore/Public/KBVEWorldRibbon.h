#pragma once

#include "CoreMinimal.h"
#include "ProceduralMeshComponent.h"

/**
 * Mesh data for a strip swept along a polyline.
 *
 * Roads and bridge decks are the same primitive at different heights, so they
 * share one builder: a road that drapes and a deck that spans differ only in
 * where the centre line's Z comes from. Keeping the sweep in one place is also
 * what makes the seam between them invisible -- both sides of the join run the
 * same UV parameterisation, so the pattern carries across rather than restarting
 * at the abutment.
 */
struct FKBVEWorldRibbonMesh
{
	TArray<FVector>   Vertices;
	TArray<int32>     Triangles;
	TArray<FVector>   Normals;
	TArray<FVector2D> UV0;
	TArray<FProcMeshTangent> Tangents;

	void Reset()
	{
		Vertices.Reset();
		Triangles.Reset();
		Normals.Reset();
		UV0.Reset();
		Tangents.Reset();
	}

	bool IsEmpty() const { return Triangles.Num() == 0; }
};

struct FKBVEWorldRibbonParams
{
	/** Full width across the strip, world units. */
	float Width = 500.0f;

	/**
	 * World units of centre line per UV tile. Distance-parameterised rather than
	 * per-segment, or the pattern stretches through curves and compresses on the
	 * straights either side of them.
	 */
	float TileLength = 500.0f;

	/** Thickness of the slab. Zero builds a single surface with no underside. */
	float Thickness = 0.0f;

	/** Lifted off the centre line by this much before anything else. */
	float ZOffset = 0.0f;

	/** Lateral offset of the whole strip, for rails running beside a deck. */
	float LateralOffset = 0.0f;

	/**
	 * Spans across the width.
	 *
	 * One span means the surface between the two draped edges is a single chord.
	 * That is fine for a bridge deck, which is meant to be flat and is narrow
	 * next to the span it crosses, and wrong for a road several terrain cells
	 * wide: the ground curves underneath it and the chord stands off the top of
	 * every rise it crosses.
	 */
	int32 LateralSegments = 1;

	/**
	 * Longest quad along the strip before it is split.
	 *
	 * The centre line's own spacing comes from the router, which chose it to
	 * describe where the road goes, not how the ground moves underneath it.
	 * Between two route samples the surface is a chord, so anything the ground
	 * does at a finer scale than this -- a rise, the shoulder of a cutting
	 * easing back into the hillside -- is spanned rather than followed. Zero
	 * leaves the caller's spacing alone.
	 */
	float MaxSegmentLength = 0.0f;

	/**
	 * Ground height for a world XY. When set, every vertex takes its own Z from
	 * here rather than from the centre line.
	 *
	 * A road wide enough to drive on is wide enough that its far edge is on
	 * different ground from its middle: draping the centre line alone leaves one
	 * edge buried in the hillside and the other in the air on any side slope.
	 * A bridge deck leaves this unset -- spanning the ground is the entire point.
	 */
	TFunction<float(float, float)> GroundZ;
};

struct KBVEWORLDCORE_API FKBVEWorldRibbon
{
	/**
	 * Sweep a strip along a centre line.
	 *
	 * Points carry their own Z, so a caller that wants the strip to follow ground
	 * samples the heightfield before calling rather than passing a sampler in --
	 * which keeps this free of any opinion about where the ground is, and lets a
	 * bridge deck ignore the ground entirely.
	 *
	 * Appends, so several strips can share one mesh section and one draw call.
	 */
	static void Append(FKBVEWorldRibbonMesh& Out, const TArray<FVector>& InCentre,
		const FKBVEWorldRibbonParams& Params);

	/** Append an axis-aligned box, for piers and abutments. */
	static void AppendBox(FKBVEWorldRibbonMesh& Out, const FVector& Min, const FVector& Max,
		float UVScale);

	/**
	 * Append one quad carrying UVs the caller worked out.
	 *
	 * For surfaces built from several boxes that have to read as one thing. A box
	 * that starts its own UVs at zero is fine for a pier, which nothing adjoins,
	 * and wrong for the four panels around a window: each would restart the
	 * pattern at its own corner and the coursing would break at every seam. Given
	 * the UVs instead, a caller can parameterise the whole wall once and hand
	 * each panel the stretch of it that belongs to it.
	 */
	static void AppendQuad(FKBVEWorldRibbonMesh& Out, const FVector& P0, const FVector& P1,
		const FVector& P2, const FVector& P3, const FVector2D& UV0, const FVector2D& UV1,
		const FVector2D& UV2, const FVector2D& UV3);

	/**
	 * The same for three corners, for the things that genuinely are triangles.
	 *
	 * A gable end and the end of a hipped roof. Emitting either as a quad with two
	 * corners on top of each other leaves a degenerate triangle in the index
	 * buffer for every one of them, which is a whole building's worth on a
	 * village.
	 */
	static void AppendTri(FKBVEWorldRibbonMesh& Out, const FVector& P0, const FVector& P1,
		const FVector& P2, const FVector2D& UV0, const FVector2D& UV1, const FVector2D& UV2);
};
