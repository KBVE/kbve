#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldHeightfieldParams.h"
#include "KBVEWorldRoadField.h"
#include "ProceduralMeshComponent.h"

/**
 * The mesh of one terrain patch, as arrays and nothing else.
 *
 * What a component is given, held apart from the component. A patch is most of
 * the cost of a chunk arriving and none of that cost needs an actor, a world or
 * the game thread -- it needs a seed, a corner, and the roads near it. Keeping
 * the result as plain arrays is what lets the work move.
 */
struct KBVEWORLDCORE_API FKBVEWorldPatchMesh
{
	TArray<FVector> Vertices;
	TArray<int32> Triangles;
	TArray<FVector> Normals;
	TArray<FVector2D> UVs;
	TArray<FLinearColor> Colors;
	TArray<FProcMeshTangent> Tangents;

	/** How long the heights took, and how long everything after them did. */
	float FillMs = 0.0f;
	float GenerateMs = 0.0f;

	void Reset()
	{
		Vertices.Reset();
		Triangles.Reset();
		Normals.Reset();
		UVs.Reset();
		Colors.Reset();
		Tangents.Reset();
		FillMs = 0.0f;
		GenerateMs = 0.0f;
	}
};

/**
 * Everything needed to build one patch, copied.
 *
 * Copied rather than referenced on purpose: a plan is handed to whatever builds
 * it, and if that is not the thread the world is streamed on then a reference
 * into the streamer is a reference into something being changed. The roads come
 * as a look for the same reason -- see FKBVEWorldRoadLook.
 */
struct KBVEWORLDCORE_API FKBVEWorldPatchPlan
{
	FKBVEWorldHeightfieldParams Shape;

	/** The patch's near corner, in tiles. */
	FVector2D TileOrigin = FVector2D::ZeroVector;

	int32 CellsPerEdge = 32;
	float CellSize = 100.0f;
	int32 WorldSeed = 0;

	/** Sampling stride. One is every cell; higher is a coarser patch. */
	int32 Step = 1;

	float SkirtDepth = 400.0f;

	/**
	 * Whether this is the collision proxy rather than the drawn surface.
	 *
	 * Skirts hide LOD cracks visually. As collision they are 400 uu walls at
	 * every chunk boundary -- invisible geometry a capsule snags on -- so the
	 * proxy gets the surface and nothing else.
	 */
	bool bCollision = false;

	/** The corridors near this patch, or an empty look where there are none. */
	FKBVEWorldRoadLook Road;
	bool bHasRoad = false;

	/**
	 * Build the patch.
	 *
	 * Padded is scratch the caller owns: the heights are sampled a ring wider
	 * than the patch and the collision proxy wants the same heights the drawn
	 * surface already computed, so a caller building both hands the same buffer
	 * to each and pays for them once.
	 *
	 * Touches nothing but its arguments, which is the whole point of it.
	 */
	static void Build(const FKBVEWorldPatchPlan& Plan, TArray<float>& Padded, bool& bPaddedValid,
		FKBVEWorldPatchMesh& Out);
};
