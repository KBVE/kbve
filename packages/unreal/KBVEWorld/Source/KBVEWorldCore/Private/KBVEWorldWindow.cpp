#include "KBVEWorldWindow.h"

namespace
{
	/**
	 * A box in the wall's own frame, drawn on the five faces that can be seen.
	 *
	 * The sixth is the one against the masonry, and a window in a village is
	 * never looked at from inside the wall it is set in.
	 */
	void Timber(FKBVEWorldRibbonMesh& Out, const FKBVEWorldWallFrame& F, float U0, float U1,
		float V0, float V1, float T0, float T1)
	{
		if (U1 - U0 <= KINDA_SMALL_NUMBER || V1 - V0 <= KINDA_SMALL_NUMBER)
		{
			return;
		}

		// Face, then the four returns. The returns are what stop a frame reading
		// as a decal: at a glancing angle it is the reveal of the timber that
		// says there is something standing off the wall.
		FKBVEWorldRibbon::AppendQuad(Out,
			F.At(U0, V0, T1), F.At(U1, V0, T1), F.At(U1, V1, T1), F.At(U0, V1, T1),
			F.UV(U0, V0), F.UV(U1, V0), F.UV(U1, V1), F.UV(U0, V1));

		FKBVEWorldRibbon::AppendQuad(Out,
			F.At(U0, V1, T1), F.At(U1, V1, T1), F.At(U1, V1, T0), F.At(U0, V1, T0),
			F.UV(U0, V1), F.UV(U1, V1), F.UV(U1, V1), F.UV(U0, V1));

		FKBVEWorldRibbon::AppendQuad(Out,
			F.At(U1, V0, T1), F.At(U0, V0, T1), F.At(U0, V0, T0), F.At(U1, V0, T0),
			F.UV(U1, V0), F.UV(U0, V0), F.UV(U0, V0), F.UV(U1, V0));

		FKBVEWorldRibbon::AppendQuad(Out,
			F.At(U0, V0, T1), F.At(U0, V1, T1), F.At(U0, V1, T0), F.At(U0, V0, T0),
			F.UV(U0, V0), F.UV(U0, V1), F.UV(U0, V1), F.UV(U0, V0));

		FKBVEWorldRibbon::AppendQuad(Out,
			F.At(U1, V1, T1), F.At(U1, V0, T1), F.At(U1, V0, T0), F.At(U1, V1, T0),
			F.UV(U1, V1), F.UV(U1, V0), F.UV(U1, V0), F.UV(U1, V1));
	}

	/** One pane, facing out. UVs span the pane so dirt and frosting fit it. */
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
	const FKBVEWorldWindowParams& Window, FKBVEWorldWindowMesh& Out)
{
	if (!Draws(Detail))
	{
		return;
	}

	const float Half = 0.5f * FMath::Max(Wall.Thickness, KINDA_SMALL_NUMBER);

	// Outward from the wall's front face. The frame stands proud of it and the
	// glass sits back behind the frame's own outer face.
	const float FrameBack = Half;
	const float FrameFront = Half + Window.FrameProud;
	const float GlassAt = FMath::Max(FrameFront - Window.GlassInset, -Half);

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
		Timber(Out.Joinery, Frame, Left, Left + Bar, Bottom, Top, FrameBack, FrameFront);
		Timber(Out.Joinery, Frame, Right - Bar, Right, Bottom, Top, FrameBack, FrameFront);
		Timber(Out.Joinery, Frame, Left + Bar, Right - Bar, Bottom, Bottom + Bar,
			FrameBack, FrameFront);
		Timber(Out.Joinery, Frame, Left + Bar, Right - Bar, Top - Bar, Top,
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
			Timber(Out.Joinery, Frame, Mid - HalfBar, Mid + HalfBar, GlassBottom, GlassTop,
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
			Timber(Out.Joinery, Frame, GlassLeft, GlassRight, Mid - HalfBar, Mid + HalfBar,
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
