#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldRibbon.h"

#include "KBVEWorldStair.generated.h"

/**
 * A flight of steps, as the figures that decide whether one can be climbed.
 *
 * The riser is a limit rather than a size: the flight works out its own from the
 * height it has to cover, so that every step in it is the same. That is the one
 * thing a real stair is never allowed to get wrong -- an odd last step is what
 * people trip on, and what a character controller catches on.
 */
USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldStairParams
{
	GENERATED_BODY()

	/**
	 * Tallest a single step may be.
	 *
	 * Has to stay under what the pawn can step up unaided, or a doorway with
	 * steps to it is harder to reach than one without: bare ground at least
	 * slopes, and a box does not.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stair", meta = (ClampMin = "1.0"))
	float MaxRiser = 17.0f;

	/** How far out each step reaches past the one above it. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stair", meta = (ClampMin = "1.0"))
	float Tread = 30.0f;

	/** How far the flight stands proud of the opening, either side. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stair", meta = (ClampMin = "0.0"))
	float SideMargin = 24.0f;

	/**
	 * Most steps one flight may have.
	 *
	 * A stop rather than a shape: past this the ground has fallen so far that
	 * what the door wants is not a stair, and the plot should not have been built
	 * on. It is here so a bad figure upstream costs a short flight rather than a
	 * thousand boxes.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stair", meta = (ClampMin = "1"))
	int32 MaxSteps = 20;
};

/**
 * Where one flight stands, in the frame of the wall whose door it serves.
 *
 * Three axes rather than a transform, because that is what the caller already
 * has: a wall knows which way is along it and which way is out of it, and being
 * handed those is what keeps the steps square to the door rather than the world.
 */
struct FKBVEWorldStairBuild
{
	/** Middle of the threshold, on the face the flight comes off. */
	FVector Origin = FVector::ZeroVector;

	/** Out of the wall, horizontal and unit length. */
	FVector Out = FVector::ForwardVector;

	/** Along the wall, in the direction its own U runs. */
	FVector Right = FVector::RightVector;

	/** Width of the opening. The flight is this plus a margin either side. */
	float Width = 120.0f;

	/** How far the threshold stands above the ground the flight has to reach. */
	float Rise = 0.0f;

	/** Carried from the wall, so the steps course with the masonry around them. */
	float TileLength = 220.0f;
	float UOffset = 0.0f;
};

struct KBVEWORLDCORE_API FKBVEWorldStair
{
	/** How many steps a rise takes, which is none when it needs none. */
	static int32 Count(const FKBVEWorldStairParams& Stair, float Rise);

	/** How far out from the wall the bottom step reaches. */
	static float Run(const FKBVEWorldStairParams& Stair, float Rise);

	/**
	 * Build one flight into a mesh.
	 *
	 * Appends into the masonry, so a village's steps cost no draw call of their
	 * own. Only the outside of the flight is emitted: the steps are nested
	 * solids, so every underside is buried in the step below it.
	 */
	static void Build(const FKBVEWorldStairParams& Stair, const FKBVEWorldStairBuild& In,
		FKBVEWorldRibbonMesh& Out);
};
