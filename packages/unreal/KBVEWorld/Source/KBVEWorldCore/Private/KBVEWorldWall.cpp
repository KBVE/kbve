#include "KBVEWorldWall.h"

namespace
{
	/**
	 * The wall's own axes, so everything below is written in (along, up, through).
	 *
	 * Right runs from the wall's start to its end, Up is world up because a
	 * building does not lean, and Norm is the face direction. A point is placed
	 * by how far along the wall it is, how far up it is and how deep into it --
	 * which is also how the UVs are worked out, and why a panel and the panel
	 * beside it agree about where the coursing is.
	 */
	struct FWallFrame
	{
		FVector Origin = FVector::ZeroVector;
		FVector Right = FVector::ForwardVector;
		FVector Up = FVector::UpVector;
		FVector Norm = FVector::RightVector;
		float UOffset = 0.0f;
		float Tile = 220.0f;

		FVector At(float U, float V, float T) const
		{
			return Origin + Right * U + Up * V + Norm * T;
		}

		FVector2D UV(float A, float B) const
		{
			return FVector2D((UOffset + A) / Tile, B / Tile);
		}
	};

	/** A face at constant depth: the front and back of the wall. */
	void FaceT(FKBVEWorldRibbonMesh& Out, const FWallFrame& F, float U0, float U1, float V0,
		float V1, float T, bool bFront)
	{
		if (U1 <= U0 || V1 <= V0)
		{
			return;
		}

		const float A = bFront ? U0 : U1;
		const float B = bFront ? U1 : U0;
		FKBVEWorldRibbon::AppendQuad(Out, F.At(A, V0, T), F.At(B, V0, T), F.At(B, V1, T),
			F.At(A, V1, T), F.UV(A, V0), F.UV(B, V0), F.UV(B, V1), F.UV(A, V1));
	}

	/** A face at constant height: the top of the wall, a soffit, a sill. */
	void FaceV(FKBVEWorldRibbonMesh& Out, const FWallFrame& F, float U0, float U1, float T0,
		float T1, float V, bool bUp)
	{
		if (U1 <= U0 || T1 <= T0)
		{
			return;
		}

		if (bUp)
		{
			FKBVEWorldRibbon::AppendQuad(Out, F.At(U0, V, T0), F.At(U0, V, T1), F.At(U1, V, T1),
				F.At(U1, V, T0), F.UV(U0, T0), F.UV(U0, T1), F.UV(U1, T1), F.UV(U1, T0));
			return;
		}

		FKBVEWorldRibbon::AppendQuad(Out, F.At(U0, V, T0), F.At(U1, V, T0), F.At(U1, V, T1),
			F.At(U0, V, T1), F.UV(U0, T0), F.UV(U1, T0), F.UV(U1, T1), F.UV(U0, T1));
	}

	/** A face at constant distance along: the ends of a wall, the jamb of an opening. */
	void FaceU(FKBVEWorldRibbonMesh& Out, const FWallFrame& F, float V0, float V1, float T0,
		float T1, float U, bool bRight)
	{
		if (V1 <= V0 || T1 <= T0)
		{
			return;
		}

		if (bRight)
		{
			FKBVEWorldRibbon::AppendQuad(Out, F.At(U, V0, T0), F.At(U, V1, T0), F.At(U, V1, T1),
				F.At(U, V0, T1), F.UV(T0, V0), F.UV(T0, V1), F.UV(T1, V1), F.UV(T1, V0));
			return;
		}

		FKBVEWorldRibbon::AppendQuad(Out, F.At(U, V0, T0), F.At(U, V0, T1), F.At(U, V1, T1),
			F.At(U, V1, T0), F.UV(T0, V0), F.UV(T1, V0), F.UV(T1, V1), F.UV(T0, V1));
	}

	/** All six faces of a box in the wall's frame, for the trim and the plinth. */
	void Box(FKBVEWorldRibbonMesh& Out, const FWallFrame& F, float U0, float U1, float V0,
		float V1, float T0, float T1)
	{
		if (U1 <= U0 || V1 <= V0 || T1 <= T0)
		{
			return;
		}

		FaceT(Out, F, U0, U1, V0, V1, T1, true);
		FaceT(Out, F, U0, U1, V0, V1, T0, false);
		FaceV(Out, F, U0, U1, T0, T1, V1, true);
		FaceV(Out, F, U0, U1, T0, T1, V0, false);
		FaceU(Out, F, V0, V1, T0, T1, U1, true);
		FaceU(Out, F, V0, V1, T0, T1, U0, false);
	}
}

void FKBVEWorldWall::Panels(const FKBVEWorldWallParams& Wall, float Length,
	TArrayView<const FKBVEWorldWallOpening> Openings, EKBVEWorldWallDetail Detail,
	TArray<FKBVEWorldWallPanel>& OutPanels, TArray<FKBVEWorldWallOpening>& OutOpenings)
{
	OutPanels.Reset();
	OutOpenings.Reset();

	const float Height = FMath::Max(Wall.Height, 0.0f);
	if (Length <= 0.0f || Height <= 0.0f)
	{
		return;
	}

	if (Detail == EKBVEWorldWallDetail::Solid)
	{
		OutPanels.Add({ 0.0f, Length, 0.0f, Height });
		return;
	}

	const float Course = FMath::Max(Wall.CourseHeight, KINDA_SMALL_NUMBER);

	// A pier at least as wide as the wall is thick, either side of every opening
	// and between any two. Masonry needs it, and it is also what keeps a seeded
	// window that landed near the corner from leaving a rectangle a millimetre
	// wide that costs two triangles and cannot be seen.
	const float Pier = FMath::Max(Wall.Thickness, Course);
	const float Widest = Length - 2.0f * Pier;
	if (Widest <= 0.0f)
	{
		OutPanels.Add({ 0.0f, Length, 0.0f, Height });
		return;
	}

	TArray<FKBVEWorldWallOpening> Sorted(Openings.GetData(), Openings.Num());
	Sorted.Sort([](const FKBVEWorldWallOpening& A, const FKBVEWorldWallOpening& B)
		{ return A.Along < B.Along; });

	float Reached = Pier;
	for (const FKBVEWorldWallOpening& Wanted : Sorted)
	{
		const float Width = FMath::Clamp(Wanted.Width, Course, Widest);

		// Snapped to the coursing, and only then clamped: snapping afterwards
		// would walk an opening back out of the wall it was just brought into.
		const float Bottom = FMath::Clamp(FMath::RoundToFloat(Wanted.Bottom / Course) * Course,
			0.0f, FMath::Max(Height - 2.0f * Course, 0.0f));
		const float Top = FMath::Clamp(
			FMath::RoundToFloat((Bottom + Wanted.Height) / Course) * Course, Bottom + Course,
			Height - Course);
		if (Top <= Bottom)
		{
			continue;
		}

		// Not a clamp on its own: with no room left the bounds cross over, and a
		// clamp to a reversed range quietly returns the low end -- which is an
		// opening placed straight through the pier it was being kept out of.
		const float Rightmost = Length - Pier - Width;
		if (Rightmost < Reached)
		{
			continue;
		}
		const float Left = FMath::Clamp(Wanted.Along - 0.5f * Width, Reached, Rightmost);

		FKBVEWorldWallOpening Placed;
		Placed.Along = Left + 0.5f * Width;
		Placed.Bottom = Bottom;
		Placed.Width = Width;
		Placed.Height = Top - Bottom;
		OutOpenings.Add(Placed);

		Reached = Left + Width + Pier;
		if (Reached > Length - Pier)
		{
			break;
		}
	}

	// The walk that turns holes into rectangles. Between two openings the wall is
	// full height; across one it is whatever is under the sill and whatever is
	// over the head, and either of those can be nothing.
	float U = 0.0f;
	for (const FKBVEWorldWallOpening& Open : OutOpenings)
	{
		const float Left = Open.Along - 0.5f * Open.Width;
		const float Right = Open.Along + 0.5f * Open.Width;
		const float Top = Open.Bottom + Open.Height;

		if (Left > U)
		{
			OutPanels.Add({ U, Left, 0.0f, Height });
		}
		if (Open.Bottom > 0.0f)
		{
			OutPanels.Add({ Left, Right, 0.0f, Open.Bottom });
		}
		if (Top < Height)
		{
			OutPanels.Add({ Left, Right, Top, Height });
		}
		U = Right;
	}
	if (U < Length)
	{
		OutPanels.Add({ U, Length, 0.0f, Height });
	}
}

void FKBVEWorldWall::Build(const FKBVEWorldWallParams& Wall, const FKBVEWorldWallBuild& In,
	TArrayView<const FKBVEWorldWallOpening> Openings, EKBVEWorldWallDetail Detail,
	FKBVEWorldRibbonMesh& Out)
{
	const FVector Along = In.End - In.Start;
	const float Length = Along.Size();
	if (Length <= KINDA_SMALL_NUMBER)
	{
		return;
	}

	FWallFrame F;
	F.Origin = In.Start;
	F.Right = Along / Length;
	F.Up = FVector::UpVector;
	F.Norm = FVector::CrossProduct(F.Right, F.Up).GetSafeNormal();
	F.UOffset = In.UOffset;
	F.Tile = FMath::Max(Wall.TileLength, KINDA_SMALL_NUMBER);

	TArray<FKBVEWorldWallPanel> Panels;
	TArray<FKBVEWorldWallOpening> Placed;
	FKBVEWorldWall::Panels(Wall, Length, Openings, Detail, Panels, Placed);
	if (Panels.Num() == 0)
	{
		return;
	}

	const float Half = 0.5f * FMath::Max(Wall.Thickness, KINDA_SMALL_NUMBER);
	const float Height = FMath::Max(Wall.Height, 0.0f);
	const float Foot = In.bPlinth ? FMath::Max(Wall.PlinthHeight, 0.0f) : 0.0f;

	// Only the faces that are on the outside of something. A panel built as a box
	// would carry six, and the two that meet the panel beside it are inside the
	// wall: on one window that is a third of the mesh drawn where nothing can
	// reach it, and a town is this many times over.
	for (const FKBVEWorldWallPanel& Panel : Panels)
	{
		FaceT(Out, F, Panel.MinU, Panel.MaxU, Panel.MinV, Panel.MaxV, Half, true);
		FaceT(Out, F, Panel.MinU, Panel.MaxU, Panel.MinV, Panel.MaxV, -Half, false);
	}

	if (In.bCapTop)
	{
		FaceV(Out, F, 0.0f, Length, -Half, Half, Height, true);
	}
	if (In.bCapEnds)
	{
		FaceU(Out, F, 0.0f, Height, -Half, Half, Length, true);
		FaceU(Out, F, 0.0f, Height, -Half, Half, 0.0f, false);
	}
	if (In.bCapBottom && Foot <= 0.0f)
	{
		FaceV(Out, F, 0.0f, Length, -Half, Half, 0.0f, false);
	}

	// The inside of every hole. Four faces each, and they exist for one view: a
	// wall this thin still shows its own depth when a window is looked at from
	// anywhere but straight on, and without them an opening reads as a decal.
	for (const FKBVEWorldWallOpening& Open : Placed)
	{
		const float Left = Open.Along - 0.5f * Open.Width;
		const float Right = Open.Along + 0.5f * Open.Width;
		const float Top = Open.Bottom + Open.Height;

		FaceU(Out, F, Open.Bottom, Top, -Half, Half, Left, true);
		FaceU(Out, F, Open.Bottom, Top, -Half, Half, Right, false);
		FaceV(Out, F, Left, Right, -Half, Half, Top, false);
		if (Open.Bottom > 0.0f)
		{
			FaceV(Out, F, Left, Right, -Half, Half, Open.Bottom, true);
		}
	}

	// Run past the ends as well as the faces. Two walls meeting at a corner each
	// stop at the footprint, so a plinth that widened only outwards would leave a
	// notch at every corner of every building; overlapping into each other costs
	// geometry nobody sees and fills it.
	if (Foot > 0.0f)
	{
		const float Over = FMath::Max(Wall.PlinthOverhang, 0.0f);
		Box(Out, F, -Over, Length + Over, -FMath::Max(In.Embed, 0.0f), Foot, -Half - Over,
			Half + Over);
	}

	if (Detail != EKBVEWorldWallDetail::Full)
	{
		return;
	}

	for (const FKBVEWorldWallOpening& Open : Placed)
	{
		const float Left = Open.Along - 0.5f * Open.Width;
		const float Right = Open.Along + 0.5f * Open.Width;
		const float Top = Open.Bottom + Open.Height;

		const float LintelOver = FMath::Max(Wall.LintelOverhang, 0.0f);
		const float LintelTop = FMath::Min(Top + FMath::Max(Wall.LintelHeight, 0.0f), Height);
		Box(Out, F, Left - LintelOver, Right + LintelOver, Top, LintelTop,
			-Half - FMath::Max(Wall.LintelProud, 0.0f), Half + FMath::Max(Wall.LintelProud, 0.0f));

		// A sill is what throws rainwater clear of the wall under a window, so it
		// belongs to windows and not to doorways -- and a doorway is exactly an
		// opening whose sill is on the floor.
		if (Open.Bottom > 0.0f)
		{
			const float SillOver = FMath::Max(Wall.SillOverhang, 0.0f);
			const float SillDrop = FMath::Max(Open.Bottom - FMath::Max(Wall.SillHeight, 0.0f), 0.0f);
			Box(Out, F, Left - SillOver, Right + SillOver, SillDrop, Open.Bottom,
				-Half - FMath::Max(Wall.SillProud, 0.0f), Half + FMath::Max(Wall.SillProud, 0.0f));
		}
	}
}

void FKBVEWorldWall::Gable(const FKBVEWorldWallParams& Wall, const FKBVEWorldWallBuild& In,
	float Apex, float Inset, FKBVEWorldRibbonMesh& Out)
{
	const FVector Along = In.End - In.Start;
	const float Length = Along.Size();
	if (Length <= KINDA_SMALL_NUMBER || Apex <= KINDA_SMALL_NUMBER)
	{
		return;
	}

	const float Edge = FMath::Clamp(Inset, 0.0f, 0.5f * Length - KINDA_SMALL_NUMBER);
	const float Peak = 0.5f * Length;

	FWallFrame F;
	F.Origin = In.Start;
	F.Right = Along / Length;
	F.Up = FVector::UpVector;
	F.Norm = FVector::CrossProduct(F.Right, F.Up).GetSafeNormal();
	F.UOffset = In.UOffset;
	F.Tile = FMath::Max(Wall.TileLength, KINDA_SMALL_NUMBER);

	const float Half = 0.5f * FMath::Max(Wall.Thickness, KINDA_SMALL_NUMBER);
	const float Base = FMath::Max(Wall.Height, 0.0f);
	const float Top = Base + Apex;

	// Carries the wall's own UV frame, so the coursing runs on up through the
	// gable from the storey below without a seam at the plate.
	const FVector2D LeftUV = F.UV(Edge, Base);
	const FVector2D RightUV = F.UV(Length - Edge, Base);
	const FVector2D PeakUV = F.UV(Peak, Top);

	FKBVEWorldRibbon::AppendTri(Out, F.At(Edge, Base, Half), F.At(Length - Edge, Base, Half),
		F.At(Peak, Top, Half), LeftUV, RightUV, PeakUV);
	FKBVEWorldRibbon::AppendTri(Out, F.At(Length - Edge, Base, -Half), F.At(Edge, Base, -Half),
		F.At(Peak, Top, -Half), RightUV, LeftUV, PeakUV);

	// No boards down the rake: the roof overhangs past this on both sides, so the
	// open edge between the two faces is under the slope that covers it.
}
