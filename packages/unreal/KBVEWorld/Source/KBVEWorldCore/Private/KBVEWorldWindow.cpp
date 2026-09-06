#include "KBVEWorldWindow.h"

namespace
{
	/**
	 * One pane, drawn from both sides. UVs span the pane so dirt and frosting fit it.
	 *
	 * Two quads back to back rather than a two-sided material: only ever one of
	 * them faces the camera, so they never z-fight and never sort against each
	 * other, and thin translucent stays a single sheet of glass however it is
	 * looked at. A single outward quad is invisible from indoors, which is not a
	 * clear window but a missing one.
	 */
	void Pane(FKBVEWorldRibbonMesh& Out, const FKBVEWorldWallFrame& F, float U0, float U1,
		float V0, float V1, float T)
	{
		if (U1 - U0 <= KINDA_SMALL_NUMBER || V1 - V0 <= KINDA_SMALL_NUMBER)
		{
			return;
		}

		FKBVEWorldRibbon::AppendQuad(Out,
			F.At(U0, V0, T), F.At(U1, V0, T), F.At(U1, V1, T), F.At(U0, V1, T),
			FVector2D(0.0f, 0.0f), FVector2D(1.0f, 0.0f), FVector2D(1.0f, 1.0f),
			FVector2D(0.0f, 1.0f));

		FKBVEWorldRibbon::AppendQuad(Out,
			F.At(U0, V1, T), F.At(U1, V1, T), F.At(U1, V0, T), F.At(U0, V0, T),
			FVector2D(0.0f, 1.0f), FVector2D(1.0f, 1.0f), FVector2D(1.0f, 0.0f),
			FVector2D(0.0f, 0.0f));
	}
}

bool FKBVEWorldWindow::Draws(EKBVEWorldWallDetail Detail)
{
	// Full only. Past it the wall keeps its reveals, so an unglazed opening still
	// reads as a window -- a dark recess with depth in it, which is what an
	// unlit window is at a distance anyway. Solid has no openings left to fill.
	return Detail == EKBVEWorldWallDetail::Full;
}

void FKBVEWorldWindow::Build(const FKBVEWorldWallParams& Wall, const FKBVEWorldWallFrame& Frame,
	TArrayView<const FKBVEWorldWallOpening> Openings, EKBVEWorldWallDetail Detail,
	const FKBVEWorldWindowParams& Window, FKBVEWorldJoineryMesh& Out)
{
	if (!Draws(Detail))
	{
		return;
	}

	const float Half = 0.5f * FMath::Max(Wall.Thickness, KINDA_SMALL_NUMBER);

	// Symmetric about the wall. The frame lines the whole reveal and stands the
	// same amount proud of each face, and the pane sits on the centre plane, so
	// the window looked out of is the window looked into. Set toward one face it
	// gives that side a shallow reveal and the other a tunnel.
	const float FrameFront = Half + Window.FrameProud;
	const float FrameBack = -FrameFront;
	const float GlassAt = 0.0f;

	for (const FKBVEWorldWallOpening& Open : Openings)
	{
		// A sill on the floor is a doorway, which is the wall's own test for the
		// same thing. Framing one would put a glazing bar across the threshold.
		if (Open.Bottom <= KINDA_SMALL_NUMBER)
		{
			continue;
		}

		const float Left = Open.Along - 0.5f * Open.Width;
		const float Right = Open.Along + 0.5f * Open.Width;
		const float Bottom = Open.Bottom;
		const float Top = Open.Bottom + Open.Height;

		const float Bar = FMath::Min(Window.FrameWidth, 0.4f * Open.Width);

		// The frame is set into the opening rather than laid around it, so the
		// masonry keeps the size of hole the wall decided on and the timber does
		// not creep across the brick beside it.
		FKBVEWorldJoinery::Box(Out.Timber, Frame, Left, Left + Bar, Bottom, Top, FrameBack, FrameFront);
		FKBVEWorldJoinery::Box(Out.Timber, Frame, Right - Bar, Right, Bottom, Top, FrameBack, FrameFront);
		FKBVEWorldJoinery::Box(Out.Timber, Frame, Left + Bar, Right - Bar, Bottom, Bottom + Bar,
			FrameBack, FrameFront);
		FKBVEWorldJoinery::Box(Out.Timber, Frame, Left + Bar, Right - Bar, Top - Bar, Top,
			FrameBack, FrameFront);

		const float GlassLeft = Left + Bar;
		const float GlassRight = Right - Bar;
		const float GlassBottom = Bottom + Bar;
		const float GlassTop = Top - Bar;

		if (GlassRight - GlassLeft <= KINDA_SMALL_NUMBER
			|| GlassTop - GlassBottom <= KINDA_SMALL_NUMBER)
		{
			continue;
		}

		// Divided rather than one sheet, above a size. A single pane a metre
		// across is a shopfront, and a village of them reads as plate glass in
		// masonry walls -- the bars are what date the building.
		const bool bMullion = Window.MullionAbove > 0.0f && Open.Width > Window.MullionAbove;
		const bool bTransom = Window.TransomAbove > 0.0f && Open.Height > Window.TransomAbove;

		TArray<FVector2D, TInlineAllocator<4>> Columns;
		TArray<FVector2D, TInlineAllocator<4>> Rows;

		if (bMullion)
		{
			const float Mid = 0.5f * (GlassLeft + GlassRight);
			const float HalfBar = 0.5f * FMath::Min(Window.BarWidth, 0.3f * Open.Width);
			FKBVEWorldJoinery::Box(Out.Timber, Frame, Mid - HalfBar, Mid + HalfBar, GlassBottom, GlassTop,
				FrameBack, FrameFront);
			Columns.Emplace(GlassLeft, Mid - HalfBar);
			Columns.Emplace(Mid + HalfBar, GlassRight);
		}
		else
		{
			Columns.Emplace(GlassLeft, GlassRight);
		}

		if (bTransom)
		{
			const float Mid = 0.5f * (GlassBottom + GlassTop);
			const float HalfBar = 0.5f * FMath::Min(Window.BarWidth, 0.3f * Open.Height);
			FKBVEWorldJoinery::Box(Out.Timber, Frame, GlassLeft, GlassRight, Mid - HalfBar, Mid + HalfBar,
				FrameBack, FrameFront);
			Rows.Emplace(GlassBottom, Mid - HalfBar);
			Rows.Emplace(Mid + HalfBar, GlassTop);
		}
		else
		{
			Rows.Emplace(GlassBottom, GlassTop);
		}

		// One pane per light rather than one behind the bars. A single sheet
		// behind a mullion is a sheet with a stick in front of it, and every
		// reflection runs straight across the join.
		for (const FVector2D& Column : Columns)
		{
			for (const FVector2D& Row : Rows)
			{
				Pane(Out.Glazing, Frame, Column.X, Column.Y, Row.X, Row.Y, GlassAt);
			}
		}
	}
}
