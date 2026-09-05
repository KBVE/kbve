#include "KBVEWorldRoof.h"

namespace
{
	uint32 RoofHash(int32 Seed, int32 Salt)
	{
		uint32 H = static_cast<uint32>(Seed) ^ 0x1B873593u;
		H = (H ^ static_cast<uint32>(Salt)) * 0x85EBCA6Bu;
		H ^= H >> 13;
		H *= 0xC2B2AE35u;
		H ^= H >> 16;
		return H;
	}

	float Unit(uint32 H)
	{
		return static_cast<float>(H & 0x00FFFFFFu) / static_cast<float>(0x01000000u);
	}

	/**
	 * The roof's own axes, in the terms the building thinks in.
	 *
	 * X runs back from the front, Y along the ridge, Z up from the wall plate --
	 * so every figure below is a distance from the middle of the house rather
	 * than a world coordinate, and the whole thing is placed once at the end.
	 */
	struct FRoofFrame
	{
		FVector Origin = FVector::ZeroVector;
		FVector Forward = FVector::ForwardVector;
		FVector Side = FVector::LeftVector;
		float Tile = 190.0f;
		float SinPitch = 1.0f;
		float EaveZ = 0.0f;

		FVector At(float X, float Y, float Z) const
		{
			return Origin + Forward * X + Side * Y + FVector::UpVector * Z;
		}

		/**
		 * Along the eave, and up the slope.
		 *
		 * The second is the height above the eave divided by the sine of the
		 * pitch, which is the true distance travelled across the tiles rather
		 * than its shadow on the ground. Measured flat, a steep roof's tiles come
		 * out squashed and a shallow one's stretched, by exactly the amount the
		 * pitch was ignored by.
		 */
		FVector2D UV(float Along, float Z) const
		{
			return FVector2D(Along / Tile, (Z - EaveZ) / (SinPitch * Tile));
		}
	};
}

EKBVEWorldRoofStyle FKBVEWorldRoof::StyleFor(const FKBVEWorldRoofParams& Roof, int32 Seed)
{
	return Unit(RoofHash(Seed, 5)) < Roof.HipChance ? EKBVEWorldRoofStyle::Hip
												   : EKBVEWorldRoofStyle::Gable;
}

float FKBVEWorldRoof::Rise(const FKBVEWorldRoofParams& Roof, float Depth)
{
	const float Pitch = FMath::DegreesToRadians(FMath::Clamp(Roof.Pitch, 1.0f, 85.0f));
	return FMath::Tan(Pitch) * 0.5f * FMath::Max(Depth, 0.0f);
}

void FKBVEWorldRoof::Build(const FKBVEWorldRoofParams& Roof, const FKBVEWorldRoofBuild& In,
	FKBVEWorldRibbonMesh& Out)
{
	const float HalfDepth = 0.5f * FMath::Max(In.Depth, 0.0f);
	const float HalfWidth = 0.5f * FMath::Max(In.Width, 0.0f);
	if (HalfDepth <= KINDA_SMALL_NUMBER || HalfWidth <= KINDA_SMALL_NUMBER)
	{
		return;
	}

	const float Pitch = FMath::DegreesToRadians(FMath::Clamp(Roof.Pitch, 1.0f, 85.0f));
	const float Slope = FMath::Tan(Pitch);
	const float Over = FMath::Max(Roof.Overhang, 0.0f);
	const float Deep = FMath::Max(Roof.Thickness, KINDA_SMALL_NUMBER);

	// Out to the drip edge, which is where the roof actually ends.
	const float X = HalfDepth + Over;
	const float Y = HalfWidth + Over;

	// The eaves hang below the wall plate, because a constant pitch carried out
	// past the wall has nowhere to go but down. That drop is the shadow line that
	// separates a roof from the masonry under it.
	const float EaveZ = -Slope * Over;

	FRoofFrame F;
	F.Origin = In.Centre;
	F.Forward = FVector(FMath::Cos(In.Yaw), FMath::Sin(In.Yaw), 0.0f);
	F.Side = FVector(-F.Forward.Y, F.Forward.X, 0.0f);
	F.Tile = FMath::Max(Roof.TileLength, KINDA_SMALL_NUMBER);
	F.SinPitch = FMath::Max(FMath::Sin(Pitch), KINDA_SMALL_NUMBER);
	F.EaveZ = EaveZ;

	const bool bHip = StyleFor(Roof, In.Seed) == EKBVEWorldRoofStyle::Hip;

	// How long the ridge is, and it is not a free parameter. Every slope of a hip
	// has the same pitch as the others -- that is what makes it a hip rather than
	// four planes that happen to meet -- and equal pitch fixes where the hip
	// rafters land. Wider than it is deep leaves a ridge; square gives a pyramid.
	const float RidgeY = bHip ? FMath::Max(Y - X, 0.0f) : Y;
	const float PeakZ = EaveZ + Slope * (bHip ? FMath::Min(X, Y) : X);

	auto Slab = [&](const FVector& A, const FVector& B, const FVector& C, const FVector& D,
					float AlongA, float AlongB, float AlongC, float AlongD)
	{
		// Top, then the soffit directly under it, then nothing else: the edges of
		// the slab are closed by the fascia below, once, rather than by each plane
		// closing its own and meeting its neighbour's inside the roof.
		FKBVEWorldRibbon::AppendQuad(Out, A, B, C, D, F.UV(AlongA, A.Z), F.UV(AlongB, B.Z),
			F.UV(AlongC, C.Z), F.UV(AlongD, D.Z));

		const FVector Drop(0.0f, 0.0f, -Deep);
		FKBVEWorldRibbon::AppendQuad(Out, D + Drop, C + Drop, B + Drop, A + Drop,
			F.UV(AlongD, D.Z), F.UV(AlongC, C.Z), F.UV(AlongB, B.Z), F.UV(AlongA, A.Z));
	};

	auto Wedge = [&](const FVector& A, const FVector& B, const FVector& Apex, float AlongA,
					 float AlongB, float AlongApex)
	{
		FKBVEWorldRibbon::AppendTri(Out, A, B, Apex, F.UV(AlongA, A.Z), F.UV(AlongB, B.Z), F.UV(AlongApex, Apex.Z));

		const FVector Drop(0.0f, 0.0f, -Deep);
		FKBVEWorldRibbon::AppendTri(Out, Apex + Drop, B + Drop, A + Drop, F.UV(AlongApex, Apex.Z), F.UV(AlongB, B.Z),
			F.UV(AlongA, A.Z));
	};

	// A vertical band along an edge of the slab: the fascia at an eave, the verge
	// board down a gable's rake.
	auto Fascia = [&](const FVector& A, const FVector& B, float AlongA, float AlongB)
	{
		const FVector Drop(0.0f, 0.0f, -Deep);
		FKBVEWorldRibbon::AppendQuad(Out, A, B, B + Drop, A + Drop,
			FVector2D(AlongA / F.Tile, 0.0f), FVector2D(AlongB / F.Tile, 0.0f),
			FVector2D(AlongB / F.Tile, Deep / F.Tile), FVector2D(AlongA / F.Tile, Deep / F.Tile));
	};

	const FVector FrontEaveL = F.At(X, -Y, EaveZ);
	const FVector FrontEaveR = F.At(X, Y, EaveZ);
	const FVector BackEaveL = F.At(-X, -Y, EaveZ);
	const FVector BackEaveR = F.At(-X, Y, EaveZ);
	const FVector RidgeL = F.At(0.0f, -RidgeY, PeakZ);
	const FVector RidgeR = F.At(0.0f, RidgeY, PeakZ);

	Slab(FrontEaveL, FrontEaveR, RidgeR, RidgeL, -Y, Y, RidgeY, -RidgeY);
	Slab(BackEaveR, BackEaveL, RidgeL, RidgeR, Y, -Y, -RidgeY, RidgeY);

	Fascia(FrontEaveR, FrontEaveL, Y, -Y);
	Fascia(BackEaveL, BackEaveR, -Y, Y);

	if (bHip)
	{
		// The two ends are the same plane at the same pitch, turned ninety
		// degrees. They close the roof, so a hip needs no masonry above the wall.
		Wedge(FrontEaveR, BackEaveR, RidgeR, X, -X, 0.0f);
		Wedge(BackEaveL, FrontEaveL, RidgeL, -X, X, 0.0f);

		Fascia(BackEaveR, FrontEaveR, -X, X);
		Fascia(FrontEaveL, BackEaveL, X, -X);
		return;
	}

	// A gable's ends are open, so the rake gets a board down each slope and the
	// triangle under it is masonry the wall builds for itself.
	Fascia(RidgeR, FrontEaveR, 0.0f, X);
	Fascia(BackEaveR, RidgeR, -X, 0.0f);
	Fascia(FrontEaveL, RidgeL, X, 0.0f);
	Fascia(RidgeL, BackEaveL, 0.0f, -X);
}
