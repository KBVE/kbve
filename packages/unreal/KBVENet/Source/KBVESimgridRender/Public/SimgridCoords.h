#pragma once

#include "CoreMinimal.h"

struct KBVESIMGRIDRENDER_API FSimgridCoords
{
	static constexpr float TILE_SIZE = 100.0f;
	static constexpr float FLOOR_HEIGHT = 200.0f;
	static constexpr int32 POS_SCALE = 32;
	static constexpr int32 VEL_SCALE = 256;

	static FVector2D QuantToWorldXY(int32 Qx, int32 Qy);
	static FVector2D TileToWorldXY(int32 X, int32 Y);
	static FVector2D QuantVelToWorldXY(int16 Qvx, int16 Qvy);
	static float FacingToYaw(uint8 Facing);
};
