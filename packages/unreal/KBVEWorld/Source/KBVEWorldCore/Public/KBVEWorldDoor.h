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

	/**
	 * How far an arched head rises above the transom it springs from.
	 *
	 * The wall cuts rectangles and is not going to stop: an arch here is joinery
	 * set inside a rectangular hole, with the timber above it filling out to the
	 * corners. Which is how a real arched doorway in a masonry wall is built, and
	 * it means an arch costs a doorway nothing anywhere else in the pipeline.
	 *
	 * Clamped against the width, since past a half the arc stops being an arch
	 * and becomes a keyhole.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Door|Arch", meta = (ClampMin = "1.0"))
	float ArchRise = 44.0f;

	/**
	 * Facets the arc is drawn with.
	 *
	 * An arch is looked at from a doorstep away or not at all, so this is the one
	 * curve in the village where the facets would show. Still cheap: the whole
	 * head is this many quads three times over, on one building's front wall, at
	 * the nearest tier only.
	 *
	 * Rounded up to an even number. On an odd one no facet lands on the middle,
	 * so the crown of the arch is a flat chord across the top of it -- which is
	 * the one place the eye goes and the one facet it would notice.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Door|Arch", meta = (ClampMin = "2"))
	int32 ArchSegments = 10;

	/**
	 * Glaze the arch rather than board it.
	 *
	 * A fanlight, which is what the space over a door is for: boarded, the arch
	 * is a line drawn on a flat panel and there is nothing to see. Glazed, the
	 * shape is a hole with light behind it and the arch is the thing you notice.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Door|Arch")
	bool bFanlight = true;
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
		const FKBVEWorldDoorParams& Door, bool bArched, FKBVEWorldJoineryMesh& Out);

	/** Whether this tier draws anything at all, so a caller can skip the walk. */
	static bool Draws(EKBVEWorldWallDetail Detail);
};
