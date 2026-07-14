#pragma once

#include "CoreMinimal.h"

enum class EKBVENpcSpriteFacing : uint8
{
	Front,
	Side,
	Back
};

struct FKBVENpcSpriteView
{
	EKBVENpcSpriteFacing Facing = EKBVENpcSpriteFacing::Front;
	bool bFlipX = false;
};

/**
 * Picks which atlas direction row to show and whether to mirror, from the monster's
 * world facing yaw and the camera position. Front when it faces the camera, Back when
 * it faces away, Side otherwise (mirrored for the right-hand side). bSwapSide flips the
 * left/right handedness if the art reads reversed.
 */
struct FKBVENpcSpriteDirection
{
	static FKBVENpcSpriteView Select(float FacingYawDeg, const FVector& NpcLocation, const FVector& CameraLocation, bool bSwapSide)
	{
		const FVector ToCam = CameraLocation - NpcLocation;
		const float DirToCamYaw = FMath::RadiansToDegrees(FMath::Atan2(ToCam.Y, ToCam.X));
		const float Delta = FMath::FindDeltaAngleDegrees(DirToCamYaw, FacingYawDeg);
		const float AbsDelta = FMath::Abs(Delta);

		FKBVENpcSpriteView View;
		if (AbsDelta <= 45.0f)
		{
			View.Facing = EKBVENpcSpriteFacing::Front;
		}
		else if (AbsDelta >= 135.0f)
		{
			View.Facing = EKBVENpcSpriteFacing::Back;
		}
		else
		{
			View.Facing = EKBVENpcSpriteFacing::Side;
		}

		bool bRight = Delta < 0.0f;
		if (bSwapSide)
		{
			bRight = !bRight;
		}
		View.bFlipX = (View.Facing == EKBVENpcSpriteFacing::Side) && bRight;
		return View;
	}
};
