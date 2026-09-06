#include "KBVEWorldDoor.h"

bool FKBVEWorldDoor::Draws(EKBVEWorldWallDetail Detail)
{
	// Full only, with the window. Past it the wall keeps its reveals, and an open
	// doorway at that range is a dark recess with depth in it -- which is what a
	// doorway in shadow is anyway. Solid has no openings left to fill.
	return Detail == EKBVEWorldWallDetail::Full;
}

void FKBVEWorldDoor::Build(const FKBVEWorldWallParams& Wall, const FKBVEWorldWallFrame& Frame,
	TArrayView<const FKBVEWorldWallOpening> Openings, EKBVEWorldWallDetail Detail,
	const FKBVEWorldDoorParams& Door, FKBVEWorldJoineryMesh& Out)
{
	if (!Draws(Detail))
	{
		return;
	}

	const float Half = 0.5f * FMath::Max(Wall.Thickness, KINDA_SMALL_NUMBER);
	const float Front = Half + Door.FrameProud;
	const float Back = -Front;
	const float LeafHalf = 0.5f * Door.LeafThickness;

	for (const FKBVEWorldWallOpening& Open : Openings)
	{
		// A sill on the floor is what makes an opening a door. The window builder
		// makes the same test and takes everything else, so the two partition one
		// list rather than each walking it looking for their own.
		if (Open.Bottom > KINDA_SMALL_NUMBER)
		{
			continue;
		}

		const float Left = Open.Along - 0.5f * Open.Width;
		const float Right = Open.Along + 0.5f * Open.Width;
		const float Top = Open.Bottom + Open.Height;

		const float Jamb = FMath::Min(Door.FrameWidth, 0.35f * Open.Width);
		const float Sill = FMath::Min(Door.ThresholdHeight, 0.25f * Open.Height);

		// The threshold runs the full width and out past both faces of the wall,
		// so the step outside meets timber rather than the plinth: two flat
		// surfaces at the same height across a doorway is the one place in the
		// village they would be looked at edge-on.
		FKBVEWorldJoinery::Box(Out.Timber, Frame, Left, Right, Open.Bottom, Open.Bottom + Sill,
			-(Half + Door.ThresholdProud), Half + Door.ThresholdProud);

		FKBVEWorldJoinery::Box(Out.Timber, Frame, Left, Left + Jamb, Open.Bottom + Sill, Top,
			Back, Front);
		FKBVEWorldJoinery::Box(Out.Timber, Frame, Right - Jamb, Right, Open.Bottom + Sill, Top,
			Back, Front);
		FKBVEWorldJoinery::Box(Out.Timber, Frame, Left + Jamb, Right - Jamb, Top - Jamb, Top,
			Back, Front);

		// The leaf, hung on the centre plane so the doorway is the same depth of
		// reveal from the room as from the street.
		const float LeafLeft = Left + Jamb + Door.LeafGap;
		const float LeafRight = Right - Jamb - Door.LeafGap;
		const float LeafBottom = Open.Bottom + Sill;
		const float LeafTop = Top - Jamb - Door.LeafGap;

		if (LeafRight - LeafLeft <= KINDA_SMALL_NUMBER
			|| LeafTop - LeafBottom <= KINDA_SMALL_NUMBER)
		{
			continue;
		}

		FKBVEWorldJoinery::Box(Out.Timber, Frame, LeafLeft, LeafRight, LeafBottom, LeafTop,
			-LeafHalf, LeafHalf);

		// Battens across the outward face. The wall's normal is the direction the
		// steps outside the front door are built along, so it is the street side
		// by construction rather than by guess.
		const float Height = LeafTop - LeafBottom;
		for (int32 I = 0; I < Door.Ledges; ++I)
		{
			const float At = LeafBottom
				+ Height * static_cast<float>(I + 1) / static_cast<float>(Door.Ledges + 1);
			const float HalfLedge = 0.5f * FMath::Min(Door.LedgeHeight, 0.3f * Height);
			FKBVEWorldJoinery::Box(Out.Timber, Frame, LeafLeft, LeafRight, At - HalfLedge,
				At + HalfLedge, LeafHalf, LeafHalf + Door.LedgeProud);
		}
	}
}
