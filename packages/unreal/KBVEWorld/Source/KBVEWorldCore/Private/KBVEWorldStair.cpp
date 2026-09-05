#include "KBVEWorldStair.h"

namespace
{
	/**
	 * The flight's own axes, written the way the wall's are: across, up and out.
	 *
	 * Deliberately the same convention as FWallFrame in KBVEWorldWall.cpp rather
	 * than shared with it. The two describe different things -- a wall's T is a
	 * depth into masonry that runs both ways from the centre line, and a stair's
	 * is a distance out from a face that only goes one way -- and tying them
	 * together would mean a change to one having to be right for the other.
	 */
	struct FStairFrame
	{
		FVector Origin = FVector::ZeroVector;
		FVector Right = FVector::RightVector;
		FVector Out = FVector::ForwardVector;
		float UOffset = 0.0f;
		float Tile = 220.0f;

		FVector At(float U, float V, float T) const
		{
			return Origin + Right * U + FVector::UpVector * V + Out * T;
		}

		FVector2D UV(float A, float B) const
		{
			return FVector2D((UOffset + A) / Tile, B / Tile);
		}
	};
}

int32 FKBVEWorldStair::Count(const FKBVEWorldStairParams& Stair, float Rise)
{
	if (Rise <= KINDA_SMALL_NUMBER)
	{
		return 0;
	}

	const float Riser = FMath::Max(Stair.MaxRiser, KINDA_SMALL_NUMBER);
	return FMath::Clamp(FMath::CeilToInt(Rise / Riser), 1, FMath::Max(Stair.MaxSteps, 1));
}

float FKBVEWorldStair::Run(const FKBVEWorldStairParams& Stair, float Rise)
{
	return static_cast<float>(Count(Stair, Rise)) * FMath::Max(Stair.Tread, 0.0f);
}

void FKBVEWorldStair::Build(const FKBVEWorldStairParams& Stair, const FKBVEWorldStairBuild& In,
	FKBVEWorldRibbonMesh& Out)
{
	const int32 Steps = Count(Stair, In.Rise);
	if (Steps <= 0 || In.Width <= 0.0f)
	{
		return;
	}

	FStairFrame F;
	F.Origin = In.Origin;
	F.Right = In.Right.GetSafeNormal();
	F.Out = In.Out.GetSafeNormal();
	F.UOffset = In.UOffset;
	F.Tile = FMath::Max(In.TileLength, KINDA_SMALL_NUMBER);

	const float Half = 0.5f * In.Width + FMath::Max(Stair.SideMargin, 0.0f);
	const float Tread = FMath::Max(Stair.Tread, KINDA_SMALL_NUMBER);

	// Worked out from the rise rather than taken from the parameters, so the
	// steps of one flight are all the same height and the top one lands exactly
	// on the threshold. Taking MaxRiser literally would leave the difference in
	// whichever step happened to be last.
	const float Riser = In.Rise / static_cast<float>(Steps);

	for (int32 Step = 0; Step < Steps; ++Step)
	{
		// Counted from the bottom, which is the step that reaches furthest out:
		// the flight is a stack of nested boxes and the lowest is the widest.
		const float Top = -In.Rise + static_cast<float>(Step + 1) * Riser;
		const float Nose = static_cast<float>(Steps - Step) * Tread;
		const float Back = Nose - Tread;

		// The tread. Only the strip this step adds past the one above it: the
		// rest of its top is under that step and would z-fight with its face.
		FKBVEWorldRibbon::AppendQuad(Out, F.At(-Half, Top, Back), F.At(-Half, Top, Nose),
			F.At(Half, Top, Nose), F.At(Half, Top, Back), F.UV(-Half, Back), F.UV(-Half, Nose),
			F.UV(Half, Nose), F.UV(Half, Back));

		// The riser, one step tall whichever step it is -- below it is the tread
		// of the step beneath, and below the bottom one is the ground.
		FKBVEWorldRibbon::AppendQuad(Out, F.At(-Half, Top - Riser, Nose), F.At(Half, Top - Riser, Nose),
			F.At(Half, Top, Nose), F.At(-Half, Top, Nose), F.UV(-Half, Top - Riser),
			F.UV(Half, Top - Riser), F.UV(Half, Top), F.UV(-Half, Top));

		// The cheeks either side, carried down to the foot of the whole flight so
		// the buried part closes against ground that rises across the width.
		const float Foot = -In.Rise;
		FKBVEWorldRibbon::AppendQuad(Out, F.At(Half, Foot, Back), F.At(Half, Top, Back),
			F.At(Half, Top, Nose), F.At(Half, Foot, Nose), F.UV(Back, Foot), F.UV(Back, Top),
			F.UV(Nose, Top), F.UV(Nose, Foot));

		FKBVEWorldRibbon::AppendQuad(Out, F.At(-Half, Foot, Back), F.At(-Half, Foot, Nose),
			F.At(-Half, Top, Nose), F.At(-Half, Top, Back), F.UV(Back, Foot), F.UV(Nose, Foot),
			F.UV(Nose, Top), F.UV(Back, Top));
	}
}
