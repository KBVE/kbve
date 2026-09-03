#include "KBVEWorldRibbon.h"

namespace
{
	void AddQuad(FKBVEWorldRibbonMesh& Out, const FVector& P0, const FVector& P1,
		const FVector& P2, const FVector& P3, const FVector2D& UVScale)
	{
		const FVector Normal = FVector::CrossProduct(P1 - P0, P3 - P0).GetSafeNormal();
		const FVector Tangent = (P1 - P0).GetSafeNormal();
		const int32 Base = Out.Vertices.Num();

		const FVector Corners[4] = { P0, P1, P2, P3 };
		const FVector2D UVs[4] = {
			FVector2D(0.0f, 0.0f),
			FVector2D(UVScale.X, 0.0f),
			FVector2D(UVScale.X, UVScale.Y),
			FVector2D(0.0f, UVScale.Y),
		};

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
	// would average the surface normal around the edge into a rolled bevel.
	const FVector Drop(0.0f, 0.0f, -Params.Thickness);
	const FVector2D SideUV(1.0f, Params.Thickness / TileLength);

	for (int32 I = 0; I < Num - 1; ++I)
	{
		const FVector2D StepUV(FVector::Dist2D(Centre[I], Centre[I + 1]) / TileLength, VSpan);

		// Ordered the other way round from the top face, because it faces the
		// other way: AddQuad takes its outward direction from the corners it is
		// given, and the underside given in the top's order comes out facing up
		// into the slab it is meant to close.
		AddQuad(Out, Left[I] + Drop, Left[I + 1] + Drop, Right[I + 1] + Drop, Right[I] + Drop, StepUV);
		AddQuad(Out, Left[I], Left[I + 1], Left[I + 1] + Drop, Left[I] + Drop, SideUV);
		AddQuad(Out, Right[I + 1], Right[I], Right[I] + Drop, Right[I + 1] + Drop, SideUV);
	}

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
