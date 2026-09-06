#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldRibbon.h"
#include "KBVEWorldWall.h"

#include "KBVEWorldDoor.generated.h"

/**
 * What fills the one opening a window will not.
 *
 * Its own file rather than more of the window's, for the reason the window is
 * not more of the wall's: the two share a material and a level of detail but
 * nothing else. A window is a hole to see through and a door is a hole that is
 * closed, so one is a frame around glass and the other is a frame around a slab,
 * and the only thing a shared builder would share is the loop over openings.
 */
USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldDoorParams
{
	GENERATED_BODY()

	/**
	 * Face width of a jamb or the head, seen straight on.
	 *
	 * Stouter than a window's, because a door frame carries a leaf and is built
	 * to. Reading it as the same stock as the sashes either side of it is what
	 * makes a front door look like a window somebody left open.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Door", meta = (ClampMin = "1.0"))
	float FrameWidth = 18.0f;

	/** How far the frame stands proud of the wall, on each face equally. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Door", meta = (ClampMin = "0.1"))
	float FrameProud = 7.0f;

	/** Thickness of the leaf itself. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Door", meta = (ClampMin = "1.0"))
	float LeafThickness = 11.0f;

	/**
	 * Gap between the leaf and the frame it hangs in.
	 *
	 * Small and non-zero. A leaf built exactly to its hole is coplanar with the
	 * jambs down both sides, and there is no join for the eye to read -- the
	 * whole doorway becomes one flat panel of timber.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Door", meta = (ClampMin = "0.0"))
	float LeafGap = 2.0f;

	/** Height of the threshold the leaf shuts down onto. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Door", meta = (ClampMin = "0.0"))
	float ThresholdHeight = 7.0f;

	/** How far the threshold runs out past the wall on each side. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Door", meta = (ClampMin = "0.0"))
	float ThresholdProud = 11.0f;

	/**
	 * Battens across the outward face of the leaf, which is what makes it a door.
	 *
	 * A plain slab of the same wood as its frame reads as a bricked-up doorway --
	 * one flat panel with a line around it. Two battens across it read as boards,
	 * and boards read as a door, which is the most a building gets here for six
	 * quads. Outward face only, since that is the side a street sees and the
	 * inside of a cottage door is a plain slab anyway. Zero drops them.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Door", meta = (ClampMin = "0"))
	int32 Ledges = 2;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Door", meta = (ClampMin = "1.0"))
	float LedgeHeight = 15.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Door", meta = (ClampMin = "0.1"))
	float LedgeProud = 4.0f;
};

struct KBVEWORLDCORE_API FKBVEWorldDoor
{
	/**
	 * Hang a leaf in every doorway of one wall.
	 *
	 * Takes the openings the wall actually cut, like the window does and for the
	 * same reason: an opening too near the end of a short wall is moved to leave a
	 * pier beside it, and a door built where the seed asked for one would stand
	 * across brick. It is also the list the stairs are placed from, so the leaf
	 * and the steps up to it cannot disagree about where the doorway is.
	 *
	 * A doorway is an opening with its sill on the floor, which is the wall's own
	 * test and the window's. The two builders partition the same list.
	 *
	 * Symmetric about the wall, because the wall draws both of its faces: a door
	 * is walked through, so the frame lines the whole reveal and stands proud of
	 * both sides. Only the ledges are one-sided, and they take the outward face
	 * the wall's normal already points at -- the same direction the steps outside
	 * are built along.
	 */
	static void Build(const FKBVEWorldWallParams& Wall, const FKBVEWorldWallFrame& Frame,
		TArrayView<const FKBVEWorldWallOpening> Openings, EKBVEWorldWallDetail Detail,
		const FKBVEWorldDoorParams& Door, FKBVEWorldJoineryMesh& Out);

	/** Whether this tier draws anything at all, so a caller can skip the walk. */
	static bool Draws(EKBVEWorldWallDetail Detail);
};
