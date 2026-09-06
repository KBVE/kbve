#include "KBVEWorldRibbon.h"

namespace
{
	void AddQuad(FKBVEWorldRibbonMesh& Out, const FVector& P0, const FVector& P1,
		const FVector& P2, const FVector& P3, const FVector2D& UVSpan);

	void AddQuad(FKBVEWorldRibbonMesh& Out, const FVector& P0, const FVector& P1,
		const FVector& P2, const FVector& P3, const FVector2D (&UVs)[4])
	{
		const FVector Normal = FVector::CrossProduct(P1 - P0, P3 - P0).GetSafeNormal();
		const FVector Tangent = (P1 - P0).GetSafeNormal();
		const int32 Base = Out.Vertices.Num();

		const FVector Corners[4] = { P0, P1, P2, P3 };

		for (int32 I = 0; I < 4; ++I)
		{
			Out.Vertices.Add(Corners[I]);
			Out.Normals.Add(Normal);
			Out.UV0.Add(UVs[I]);
			Out.Tangents.Add(FProcMeshTangent(Tangent, false));
		}

		// Wound against the stated normal, which is the convention the swept
		// surface below uses: its top face is emitted so that the geometric cross
		// product of a triangle opposes the normal it carries. AddQuad used to
		// wind with its normal instead, so every face it made -- the underside,
		// both sides, the end caps, and every box -- was back-facing while the
		// top was not. A rail is mostly side, so it rendered as a flat ribbon
		// with nothing to it, and the piers under a deck were inside out and
		// therefore not there at all.
		Out.Triangles.Add(Base + 0);
		Out.Triangles.Add(Base + 2);
		Out.Triangles.Add(Base + 1);
		Out.Triangles.Add(Base + 0);
		Out.Triangles.Add(Base + 3);
		Out.Triangles.Add(Base + 2);
	}

	void AddQuad(FKBVEWorldRibbonMesh& Out, const FVector& P0, const FVector& P1,
		const FVector& P2, const FVector& P3, const FVector2D& UVSpan)
	{
		const FVector2D UVs[4] = {
			FVector2D(0.0f, 0.0f),
			FVector2D(UVSpan.X, 0.0f),
			FVector2D(UVSpan.X, UVSpan.Y),
			FVector2D(0.0f, UVSpan.Y),
		};
		AddQuad(Out, P0, P1, P2, P3, UVs);
	}

	/**
	 * One face of a slab, as a strip that shares its vertices along the run.
	 *
	 * Quad by quad, a face costs four vertices per segment and the joint between
	 * two segments is two coincident pairs -- on a deck refined to a few hundred
	 * samples the underside and the two edges are most of the mesh, and almost
	 * all of it is duplicates of the vertex next to it. Shared along the run, a
	 * segment costs two.
	 *
	 * Only along the run. The crease across it stays split, because the three
	 * faces are still built as three strips that share nothing with each other or
	 * with the top: a deck seen from a riverbank shows all of them at once, and
	 * welding around the edge would average the surface normal into a bevel.
	 *
	 * Winds as AddQuad would for (A[i], A[i+1], B[i+1], B[i]). Flipped, it winds
	 * as it would for that quad's mirror, which is what a face running the other
	 * way down the strip needs.
	 */
	void AddStrip(FKBVEWorldRibbonMesh& Out, const TArray<FVector>& A, const TArray<FVector>& B,
		const TArray<FVector2D>& UVs, bool bFlip)
	{
		const int32 Num = A.Num();
		if (Num < 2)
		{
			return;
		}

		const int32 Base = Out.Vertices.Num();

		for (int32 I = 0; I < Num; ++I)
		{
			// Averaged from the segments either side, so the run shades smoothly
			// while the crease across it stays hard.
			const int32 Prev = FMath::Max(I - 1, 0);
			const int32 Next = FMath::Min(I + 1, Num - 1);
			const FVector Along = (A[Next] - A[Prev]).GetSafeNormal();
			const FVector Normal = FVector::CrossProduct(B[I] - A[I], Along).GetSafeNormal();

			Out.Vertices.Add(A[I]);
			Out.Normals.Add(Normal);
			Out.UV0.Add(FVector2D(UVs[I].X, 0.0f));
			Out.Tangents.Add(FProcMeshTangent(Along, false));

			Out.Vertices.Add(B[I]);
			Out.Normals.Add(Normal);
			Out.UV0.Add(FVector2D(UVs[I].X, UVs[I].Y));
			Out.Tangents.Add(FProcMeshTangent(Along, false));
		}

		for (int32 I = 0; I + 1 < Num; ++I)
		{
			const int32 A0 = Base + I * 2;
			const int32 B0 = A0 + 1;
			const int32 A1 = A0 + 2;
			const int32 B1 = A0 + 3;

			if (bFlip)
			{
				Out.Triangles.Add(A0);
				Out.Triangles.Add(A1);
				Out.Triangles.Add(B1);
				Out.Triangles.Add(A0);
				Out.Triangles.Add(B1);
				Out.Triangles.Add(B0);
			}
			else
			{
				Out.Triangles.Add(A0);
				Out.Triangles.Add(B1);
				Out.Triangles.Add(A1);
				Out.Triangles.Add(A0);
				Out.Triangles.Add(B0);
				Out.Triangles.Add(B1);
			}
		}
	}
}

void FKBVEWorldRibbon::Append(FKBVEWorldRibbonMesh& Out, const TArray<FVector>& InCentre,
	const FKBVEWorldRibbonParams& Params)
{
	if (InCentre.Num() < 2 || Params.Width <= 0.0f)
	{
		return;
	}

	TArray<FVector> Resampled;
	if (Params.MaxSegmentLength > KINDA_SMALL_NUMBER)
	{
		Resampled.Reserve(InCentre.Num() * 2);
		for (int32 I = 0; I + 1 < InCentre.Num(); ++I)
		{
			const FVector& A = InCentre[I];
			const FVector& B = InCentre[I + 1];
			const int32 Splits = FMath::Max(
				FMath::CeilToInt(FVector::Dist2D(A, B) / Params.MaxSegmentLength), 1);
			for (int32 S = 0; S < Splits; ++S)
			{
				Resampled.Add(FMath::Lerp(A, B, static_cast<float>(S) / static_cast<float>(Splits)));
			}
		}
		Resampled.Add(InCentre.Last());
	}

	const TArray<FVector>& Centre = Resampled.Num() > 0 ? Resampled : InCentre;
	const int32 Num = Centre.Num();

	const float TileLength = FMath::Max(Params.TileLength, 1.0f);
	const float Half = Params.Width * 0.5f;
	const float VSpan = Params.Width / TileLength;
	const int32 Spans = FMath::Max(Params.LateralSegments, 1);
	const int32 Columns = Spans + 1;

	TArray<FVector> Left;
	TArray<FVector> Right;
	Left.SetNumUninitialized(Num);
	Right.SetNumUninitialized(Num);

	// Kept, because the underside and the edges want the same parameterisation
	// the top has rather than one that restarts at every joint.
	TArray<float> RunU;
	RunU.SetNumUninitialized(Num);

	float Distance = 0.0f;
	const int32 Base = Out.Vertices.Num();

	for (int32 I = 0; I < Num; ++I)
	{
		// Central difference at the joints, so a corner splits the turn between
		// its two segments instead of mitring hard onto one of them.
		const FVector& Prev = Centre[FMath::Max(I - 1, 0)];
		const FVector& Next = Centre[FMath::Min(I + 1, Num - 1)];
		const FVector T = (Next - Prev).GetSafeNormal();
		const FVector Across = FVector(T.Y, -T.X, 0.0f).GetSafeNormal();
		const FVector P = Centre[I] + FVector(0.0f, 0.0f, Params.ZOffset) + Across * Params.LateralOffset;

		if (I > 0)
		{
			Distance += FVector::Dist2D(Centre[I - 1], Centre[I]);
		}
		const float U = Distance / TileLength;
		RunU[I] = U;

		for (int32 C = 0; C < Columns; ++C)
		{
			const float Frac = static_cast<float>(C) / static_cast<float>(Spans);
			FVector V = P + Across * FMath::Lerp(-Half, Half, Frac);
			if (Params.GroundZ)
			{
				V.Z = Params.GroundZ(V.X, V.Y) + Params.ZOffset;
			}

			Out.Vertices.Add(V);
			Out.UV0.Add(FVector2D(U, VSpan * Frac));
			Out.Tangents.Add(FProcMeshTangent(T, false));
			// Filled in below: a vertex's normal depends on the columns either
			// side of it, which do not exist yet.
			Out.Normals.Add(FVector::UpVector);

			if (C == 0)
			{
				Left[I] = V;
			}
			if (C == Spans)
			{
				Right[I] = V;
			}
		}
	}

	for (int32 I = 0; I < Num; ++I)
	{
		const FVector& Prev = Centre[FMath::Max(I - 1, 0)];
		const FVector& Next = Centre[FMath::Min(I + 1, Num - 1)];
		const FVector T = (Next - Prev).GetSafeNormal();

		for (int32 C = 0; C < Columns; ++C)
		{
			// Across from the neighbouring columns rather than from the strip's
			// full width, so a surface that follows the ground is lit by the
			// slope it actually has at each point instead of by the average of
			// its two far edges.
			const int32 Index = Base + I * Columns + C;
			const FVector& A = Out.Vertices[Base + I * Columns + FMath::Max(C - 1, 0)];
			const FVector& B = Out.Vertices[Base + I * Columns + FMath::Min(C + 1, Spans)];
			const FVector Span = (B - A).GetSafeNormal();
			Out.Normals[Index] = FVector::CrossProduct(Span, T).GetSafeNormal();
		}
	}

	for (int32 I = 0; I < Num - 1; ++I)
	{
		for (int32 C = 0; C < Spans; ++C)
		{
			const int32 A = Base + I * Columns + C;
			const int32 B = A + 1;
			const int32 D = Base + (I + 1) * Columns + C;
			const int32 E = D + 1;

			Out.Triangles.Add(A);
			Out.Triangles.Add(D);
			Out.Triangles.Add(E);
			Out.Triangles.Add(A);
			Out.Triangles.Add(E);
			Out.Triangles.Add(B);
		}
	}

	if (Params.Thickness <= 0.0f)
	{
		return;
	}

	// Underside and edges get their own vertices rather than reusing the top's.
	// A deck seen from a riverbank shows all three at once, and sharing vertices
	// would average the surface normal around the edge into a rolled bevel. They
	// do share along their own run, though, which is where the duplicates were.
	const FVector Drop(0.0f, 0.0f, -Params.Thickness);
	const FVector2D SideUV(1.0f, Params.Thickness / TileLength);

	TArray<FVector> LeftDrop;
	TArray<FVector> RightDrop;
	LeftDrop.SetNumUninitialized(Num);
	RightDrop.SetNumUninitialized(Num);
	for (int32 I = 0; I < Num; ++I)
	{
		LeftDrop[I] = Left[I] + Drop;
		RightDrop[I] = Right[I] + Drop;
	}

	// Parameterised by distance like the top is, rather than restarting at every
	// joint. The old per-segment UV made the pattern repeat once per segment
	// whatever the segment's length, so it compressed wherever the route sampled
	// finely -- and now that a far level sweeps a thinned line, the same rail
	// would have carried a different texture at each level of detail.
	TArray<FVector2D> AcrossUV;
	TArray<FVector2D> DownUV;
	AcrossUV.SetNumUninitialized(Num);
	DownUV.SetNumUninitialized(Num);
	for (int32 I = 0; I < Num; ++I)
	{
		AcrossUV[I] = FVector2D(RunU[I], VSpan);
		DownUV[I] = FVector2D(RunU[I], SideUV.Y);
	}

	// Ordered the other way round from the top face, because it faces the other
	// way: the underside given in the top's order comes out facing up into the
	// slab it is meant to close.
	AddStrip(Out, LeftDrop, RightDrop, AcrossUV, false);
	AddStrip(Out, Left, LeftDrop, DownUV, false);
	AddStrip(Out, Right, RightDrop, DownUV, true);

	AddQuad(Out, Right[0], Left[0], Left[0] + Drop, Right[0] + Drop, SideUV);
	AddQuad(Out, Left[Num - 1], Right[Num - 1], Right[Num - 1] + Drop, Left[Num - 1] + Drop, SideUV);
}

void FKBVEWorldRibbon::AppendBox(FKBVEWorldRibbonMesh& Out, const FVector& Min, const FVector& Max,
	float UVScale)
{
	const float Scale = FMath::Max(UVScale, 1.0f);
	const FVector A(Min.X, Min.Y, Min.Z);
	const FVector B(Max.X, Min.Y, Min.Z);
	const FVector C(Max.X, Max.Y, Min.Z);
	const FVector D(Min.X, Max.Y, Min.Z);
	const FVector E(Min.X, Min.Y, Max.Z);
	const FVector F(Max.X, Min.Y, Max.Z);
	const FVector G(Max.X, Max.Y, Max.Z);
	const FVector H(Min.X, Max.Y, Max.Z);

	const FVector Size = Max - Min;
	const FVector2D XZ(Size.X / Scale, Size.Z / Scale);
	const FVector2D YZ(Size.Y / Scale, Size.Z / Scale);
	const FVector2D XY(Size.X / Scale, Size.Y / Scale);

	AddQuad(Out, E, F, G, H, XY);
	AddQuad(Out, A, D, C, B, XY);
	AddQuad(Out, A, B, F, E, XZ);
	AddQuad(Out, C, D, H, G, XZ);
	AddQuad(Out, B, C, G, F, YZ);
	AddQuad(Out, D, A, E, H, YZ);
}

void FKBVEWorldRibbon::AppendQuad(FKBVEWorldRibbonMesh& Out, const FVector& P0, const FVector& P1,
	const FVector& P2, const FVector& P3, const FVector2D& UV0, const FVector2D& UV1,
	const FVector2D& UV2, const FVector2D& UV3)
{
	const FVector2D UVs[4] = { UV0, UV1, UV2, UV3 };
	AddQuad(Out, P0, P1, P2, P3, UVs);
}

void FKBVEWorldRibbon::AppendTri(FKBVEWorldRibbonMesh& Out, const FVector& P0, const FVector& P1,
	const FVector& P2, const FVector2D& UV0, const FVector2D& UV1, const FVector2D& UV2)
{
	const FVector Normal = FVector::CrossProduct(P1 - P0, P2 - P0).GetSafeNormal();
	const FVector Tangent = (P1 - P0).GetSafeNormal();
	const int32 Base = Out.Vertices.Num();

	const FVector Corners[3] = { P0, P1, P2 };
	const FVector2D UVs[3] = { UV0, UV1, UV2 };
	for (int32 I = 0; I < 3; ++I)
	{
		Out.Vertices.Add(Corners[I]);
		Out.Normals.Add(Normal);
		Out.UV0.Add(UVs[I]);
		Out.Tangents.Add(FProcMeshTangent(Tangent, false));
	}

	// Wound against the stated normal, as everything else here is.
	Out.Triangles.Add(Base + 0);
	Out.Triangles.Add(Base + 2);
	Out.Triangles.Add(Base + 1);
}
