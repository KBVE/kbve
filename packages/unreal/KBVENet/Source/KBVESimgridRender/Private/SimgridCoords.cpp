#include "SimgridCoords.h"

FVector2D FSimgridCoords::QuantToWorldXY(int32 Qx, int32 Qy)
{
	return FVector2D(
		(double)Qx / (double)POS_SCALE * (double)TILE_SIZE,
		(double)Qy / (double)POS_SCALE * (double)TILE_SIZE);
}

FVector2D FSimgridCoords::TileToWorldXY(int32 X, int32 Y)
{
	return FVector2D((double)X * (double)TILE_SIZE, (double)Y * (double)TILE_SIZE);
}

FVector2D FSimgridCoords::QuantVelToWorldXY(int16 Qvx, int16 Qvy)
{
	return FVector2D(
		(double)Qvx / (double)VEL_SCALE * (double)TILE_SIZE,
		(double)Qvy / (double)VEL_SCALE * (double)TILE_SIZE);
}

float FSimgridCoords::FacingToYaw(uint8 Facing)
{
	switch (Facing)
	{
	case 1: return 180.0f;
	case 2: return 90.0f;
	case 3: return 270.0f;
	default: return 0.0f;
	}
}
