#include "KBVEWorldDoor.h"

namespace
{
	/**
	 * Height of a segmental arc over its own chord.
	 *
	 * Springing at both ends of the chord and rising to the middle, so the radius
	 * falls out of the two: a rise of half the width is the semicircle and
	 * anything less is the flatter arch a cottage doorway actually gets.
	 */
	float ArcAt(float U, float Left, float Right, float Spring, float Rise)
	{
		const float Half = 0.5f * (Right - Left);
		if (Half <= KINDA_SMALL_NUMBER || Rise <= KINDA_SMALL_NUMBER)
		{
			return Spring;
		}

		const float Radius = (Rise * Rise + Half * Half) / (2.0f * Rise);
		const float Offset = FMath::Clamp(U - 0.5f * (Left + Right), -Half, Half);
		return Spring + Rise - Radius
			+ FMath::Sqrt(FMath::Max(Radius * Radius - Offset * Offset, 0.0f));
	}
}

bool FKBVEWorldDoor::Draws(EKBVEWorldWallDetail Detail)
{
	// Full only, with the window. Past it the wall keeps its reveals, and an open
	// doorway at that range is a dark recess with depth in it -- which is what a
	// doorway in shadow is anyway. Solid has no openings left to fill.
	return Detail == EKBVEWorldWallDetail::Full;
}

void FKBVEWorldDoor::Build(const FKBVEWorldWallParams& Wall, const FKBVEWorldWallFrame& Frame,
	TArrayView<const FKBVEWorldWallOpening> Openings, EKBVEWorldWallDetail Detail,
	const FKBVEWorldDoorParams& Door, bool bArched, FKBVEWorldJoineryMesh& Out)
{
	if (!Draws(Detail))
	{
		return;
	}

	const float Half = 0.5f * FMath::Max(Wall.Thickness, KINDA_SMALL_NUMBER);
	const float Front = Half + Door.FrameProud;
	const float Back = -Front;
	// The leaf hangs at the street face rather than on the centre plane. Its own
	// outer face is the wall's, so the only thing proud of the masonry at a
	// doorway is the frame.
	const float LeafFace = Half - FMath::Max(Door.LeafSetback, 0.0f);
	const float LeafBack = LeafFace - FMath::Max(Door.LeafThickness, KINDA_SMALL_NUMBER);

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

		const float Inner = Left + Jamb;
		const float Outer = Right - Jamb;
		const float Span = Outer - Inner;

		// The head, which is the whole of the difference between an arched doorway
		// and a square one. The hole in the masonry is the same rectangle either
		// way -- an arch is what the joiner does inside it.
		const float Apex = Top - Jamb;
		const float Rise = FMath::Min(FMath::Max(Door.ArchRise, 0.0f), 0.45f * Span);
		const float Spring = Apex - Rise;

		// Square if there is nowhere to put one. A fanlight squeezed into the last
		// few centimetres over a low door is a slot, not an arch, and a leaf cut
		// down to make room for it is a doorway nobody fits through.
		const float Squat = Open.Bottom + Sill + 0.55f * Open.Height;
		const bool bArch = bArched && Span > KINDA_SMALL_NUMBER && Rise > KINDA_SMALL_NUMBER
			&& Spring - Jamb > Squat;

		// Even, so a facet lands on the crown rather than a chord lying across it.
		const int32 Wanted = FMath::Max(Door.ArchSegments, 2);
		const int32 Facets = bArch ? Wanted + (Wanted % 2) : 0;

		if (bArch)
		{
			// The transom the arch springs from, and the head of the leaf below it.
			FKBVEWorldJoinery::Box(Out.Timber, Frame, Inner, Outer, Spring - Jamb, Spring,
				Back, Front);

			for (int32 I = 0; I < Facets; ++I)
			{
				const float U0 = Inner + Span * static_cast<float>(I) / static_cast<float>(Facets);
				const float U1 =
					Inner + Span * static_cast<float>(I + 1) / static_cast<float>(Facets);
				const float V0 = ArcAt(U0, Inner, Outer, Spring, Rise);
				const float V1 = ArcAt(U1, Inner, Outer, Spring, Rise);

				// Timber from the arc out to the corners of the hole. This is the
				// spandrel and the head in one piece, because they are one piece:
				// the arch is a shape cut out of the solid rather than a ring laid
				// over a void that would then need its own filling.
				FKBVEWorldRibbon::AppendQuad(Out.Timber,
					Frame.At(U0, V0, Front), Frame.At(U1, V1, Front), Frame.At(U1, Top, Front),
					Frame.At(U0, Top, Front),
					Frame.UV(U0, V0), Frame.UV(U1, V1), Frame.UV(U1, Top), Frame.UV(U0, Top));

				FKBVEWorldRibbon::AppendQuad(Out.Timber,
					Frame.At(U0, Top, Back), Frame.At(U1, Top, Back), Frame.At(U1, V1, Back),
					Frame.At(U0, V0, Back),
					Frame.UV(U0, Top), Frame.UV(U1, Top), Frame.UV(U1, V1), Frame.UV(U0, V0));

				// The soffit of the arch, which is the face anybody standing in the
				// doorway is looking straight up at.
				FKBVEWorldRibbon::AppendQuad(Out.Timber,
					Frame.At(U0, V0, Back), Frame.At(U1, V1, Back), Frame.At(U1, V1, Front),
					Frame.At(U0, V0, Front),
					Frame.UV(U0, V0), Frame.UV(U1, V1), Frame.UV(U1, V1), Frame.UV(U0, V0));

				if (!Door.bFanlight)
				{
					continue;
				}

				// The fanlight, on the centre plane and facing both ways, like every
				// other pane in the village.
				const FVector2D A(static_cast<float>(I) / static_cast<float>(Facets), 0.0f);
				const FVector2D B(static_cast<float>(I + 1) / static_cast<float>(Facets), 0.0f);
				const FVector2D C(B.X, 1.0f);
				const FVector2D D(A.X, 1.0f);

				// Facets, not quads: the fanlight fans onto its transom, so the
				// panes at either springing have two corners in the same place.
				FKBVEWorldRibbon::AppendFacet(Out.Glazing,
					Frame.At(U0, Spring, 0.0f), Frame.At(U1, Spring, 0.0f),
					Frame.At(U1, V1, 0.0f), Frame.At(U0, V0, 0.0f), A, B, C, D);

				FKBVEWorldRibbon::AppendFacet(Out.Glazing,
					Frame.At(U0, V0, 0.0f), Frame.At(U1, V1, 0.0f),
					Frame.At(U1, Spring, 0.0f), Frame.At(U0, Spring, 0.0f), D, C, B, A);
			}
		}
		else
		{
			FKBVEWorldJoinery::Box(Out.Timber, Frame, Inner, Outer, Top - Jamb, Top, Back, Front);
		}

		// The leaf, hung on the centre plane so the doorway is the same depth of
		// reveal from the room as from the street.
		// Lapped past the clear opening on every edge, so the leaf's own edges are
		// buried in the frame instead of showing a slot through to the room.
		const float Lap = FMath::Min(Door.LeafLap, Jamb);
		const float LeafLeft = Inner - Lap;
		const float LeafRight = Outer + Lap;
		const float LeafBottom = Open.Bottom + Sill;
		const float LeafTop = (bArch ? Spring - Jamb : Top - Jamb) + Lap;

		if (LeafRight - LeafLeft <= KINDA_SMALL_NUMBER
			|| LeafTop - LeafBottom <= KINDA_SMALL_NUMBER)
		{
			continue;
		}

		// The leaf is built in its own space rather than the wall's, hinge at the
		// origin, because it is the one part of a building that moves. Local X
		// runs along the leaf from the hinge and local Y is the way it opens, so
		// a positive yaw takes the free edge away from the street.
		FKBVEWorldDoorLeaf& Leaf = Out.Leaves.AddDefaulted_GetRef();
		Leaf.Hinge = Frame.At(LeafLeft, LeafBottom, 0.0f);
		Leaf.Along = Frame.Right;
		Leaf.Swing = FMath::Clamp(Door.Swing, 0.0f, 175.0f);

		FKBVEWorldWallFrame Local;
		Local.Origin = FVector::ZeroVector;
		Local.Right = FVector::ForwardVector;
		Local.Up = FVector::UpVector;
		Local.Norm = FVector::CrossProduct(Local.Right, Local.Up).GetSafeNormal();
		Local.Tile = Frame.Tile;
		Local.UOffset = Frame.UOffset + LeafLeft;

		const float Width = LeafRight - LeafLeft;
		const float Height = LeafTop - LeafBottom;

		FKBVEWorldJoinery::Box(Leaf.Mesh, Local, 0.0f, Width, 0.0f, Height, LeafBack, LeafFace);

		// Battens across the outward face. The wall's normal is the direction the
		// steps outside the front door are built along, so it is the street side
		// by construction rather than by guess.
		for (int32 I = 0; I < Door.Ledges; ++I)
		{
			const float At = Height * static_cast<float>(I + 1) / static_cast<float>(Door.Ledges + 1);
			const float HalfLedge = 0.5f * FMath::Min(Door.LedgeHeight, 0.3f * Height);
			FKBVEWorldJoinery::Box(Leaf.Mesh, Local, 0.0f, Width, At - HalfLedge,
				At + HalfLedge, LeafFace, LeafFace + Door.LedgeProud);
		}
	}
}
