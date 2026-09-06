#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldRibbon.h"
#include "KBVEWorldWall.h"

#include "KBVEWorldWindow.generated.h"

/**
 * What fills the holes a wall leaves.
 *
 * Its own file rather than more of the wall's, because it is its own material
 * and its own level of detail: joinery is timber where the wall is masonry, and
 * glass is the one surface in a village expensive enough to be worth switching
 * off at a distance. A wall that also knew about glazing would be the one place
 * every one of those decisions had to be made.
 */
USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldWindowParams
{
	GENERATED_BODY()

	/**
	 * Face width of a frame member, seen straight on.
	 *
	 * Sized against the opening it sits in rather than against a real sash. A
	 * bay window here is 98cm wide, and joinery slim enough to be correct at arm's
	 * length is a hairline by the time the building is a house across a field.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Window", meta = (ClampMin = "1.0"))
	float FrameWidth = 14.0f;

	/**
	 * How far the frame stands proud of the wall, on each face equally.
	 *
	 * Non-zero on purpose: flush with the masonry the two surfaces are coplanar
	 * and z-fight along every edge of every window in the village. Past that it
	 * is what casts the shadow line down the frame, and a frame with no shadow
	 * under it reads as paint on the wall however wide its face is.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Window", meta = (ClampMin = "0.1"))
	float FrameProud = 7.0f;

	/** A window wider than this gets a vertical bar down the middle. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Window", meta = (ClampMin = "0.0"))
	float MullionAbove = 76.0f;

	/** A window taller than this gets a horizontal bar across it. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Window", meta = (ClampMin = "0.0"))
	float TransomAbove = 118.0f;

	/** Face width of a mullion or transom, which is lighter than the frame. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Window", meta = (ClampMin = "1.0"))
	float BarWidth = 9.0f;
};

struct KBVEWORLDCORE_API FKBVEWorldWindow
{
	/**
	 * Frame and glaze the openings of one wall.
	 *
	 * Takes the openings the wall actually built rather than the ones it was
	 * asked for: the wall snaps them to its coursing and clamps them into its own
	 * length, so the seeded rectangle and the hole in the masonry are not the
	 * same rectangle. Framing the seeded one leaves timber across brick.
	 *
	 * A doorway is skipped. Sill on the floor is what makes an opening a door,
	 * which is the same test the wall itself uses, and a door wants a leaf and a
	 * threshold rather than a pane.
	 *
	 * Built symmetrically about the wall, because the wall draws both of its
	 * faces and both reveals of every opening -- so a window is looked out of as
	 * often as it is looked at, and joinery hung on the outer face alone leaves
	 * the room an open-backed box with the pane culled away behind it.
	 */
	static void Build(const FKBVEWorldWallParams& Wall, const FKBVEWorldWallFrame& Frame,
		TArrayView<const FKBVEWorldWallOpening> Openings, EKBVEWorldWallDetail Detail,
		const FKBVEWorldWindowParams& Window, FKBVEWorldJoineryMesh& Out);

	/** Whether this tier draws anything at all, so a caller can skip the walk. */
	static bool Draws(EKBVEWorldWallDetail Detail);
};
