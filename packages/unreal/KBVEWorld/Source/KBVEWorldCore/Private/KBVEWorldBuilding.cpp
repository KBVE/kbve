#include "KBVEWorldBuilding.h"

namespace
{
	// The settlement's own stream, off the world seed rather than out of it, for
	// the same reason the fences have one: a decision added upstream must not
	// walk every house in the world.
	uint32 BuildingHash(int32 Seed, int32 Salt)
	{
		uint32 H = static_cast<uint32>(Seed) ^ 0x7F4A7C15u;
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

	float Range(int32 Seed, int32 Salt, float Min, float Max)
	{
		return FMath::Lerp(FMath::Min(Min, Max), FMath::Max(Min, Max),
			Unit(BuildingHash(Seed, Salt)));
	}

	/**
	 * The openings one wall of one storey carries.
	 *
	 * Bays rather than a spacing: the wall is divided into as many whole bays as
	 * fit and a window is centred in each, so the pattern is even on a wall of
	 * any length instead of running out against a corner. Anything that does not
	 * fit is dropped by the decomposition rather than checked for here -- the
	 * wall already has to decide what a mason could have built, and having two
	 * places decide it is how they come to disagree.
	 */
	void BayOpenings(const FKBVEWorldBuildingParams& Building, float Length, bool bDoor,
		TArray<FKBVEWorldWallOpening>& Out)
	{
		Out.Reset();

		const float Bay = FMath::Max(Building.BayWidth, KINDA_SMALL_NUMBER);
		const int32 Bays = FMath::Max(FMath::RoundToInt(Length / Bay), 1);
		const int32 DoorBay = bDoor ? Bays / 2 : INDEX_NONE;

		for (int32 I = 0; I < Bays; ++I)
		{
			FKBVEWorldWallOpening Opening;
			Opening.Along = (static_cast<float>(I) + 0.5f) * Length / static_cast<float>(Bays);

			if (I == DoorBay)
			{
				Opening.Bottom = 0.0f;
				Opening.Width = Building.DoorWidth;
				Opening.Height = Building.DoorHeight;
			}
			else
			{
				Opening.Bottom = Building.WindowSill;
				Opening.Width = Building.WindowWidth;
				Opening.Height = Building.WindowHeight;
			}
			Out.Add(Opening);
		}
	}
}

void FKBVEWorldBuilding::Footprint(const FKBVEWorldBuildingPlan& Plan, FVector (&OutCorners)[4])
{
	const FVector Forward(FMath::Cos(Plan.Yaw), FMath::Sin(Plan.Yaw), 0.0f);
	const FVector Side(-Forward.Y, Forward.X, 0.0f);
	const FVector Front = Forward * (0.5f * Plan.Depth);
	const FVector Left = Side * (0.5f * Plan.Width);

	OutCorners[0] = Plan.Centre + Front - Left;
	OutCorners[1] = Plan.Centre + Front + Left;
	OutCorners[2] = Plan.Centre - Front + Left;
	OutCorners[3] = Plan.Centre - Front - Left;
}

FKBVEWorldBuildingPlan FKBVEWorldBuilding::Plan(const FKBVEWorldBuildingParams& Building,
	int32 Seed, const FVector& Centre, float Yaw)
{
	FKBVEWorldBuildingPlan Out;
	Out.Centre = Centre;
	Out.Yaw = Yaw;
	Out.Seed = Seed;
	Out.Width = Range(Seed, 1, Building.MinWidth, Building.MaxWidth);
	Out.Depth = Range(Seed, 2, Building.MinDepth, Building.MaxDepth);

	const int32 Low = FMath::Max(Building.MinStoreys, 1);
	const int32 High = FMath::Max(Building.MaxStoreys, Low);
	Out.Storeys = Low + static_cast<int32>(Unit(BuildingHash(Seed, 3)) * static_cast<float>(High - Low + 1));
	Out.Storeys = FMath::Clamp(Out.Storeys, Low, High);
	return Out;
}

void FKBVEWorldBuilding::Build(const FKBVEWorldBuildingParams& Building,
	const FKBVEWorldBuildingPlan& Plan, EKBVEWorldWallDetail Detail, FKBVEWorldRibbonMesh& Out)
{
	FVector Corners[4];
	Footprint(Plan, Corners);

	const float Storey = FMath::Max(Building.Wall.Height, KINDA_SMALL_NUMBER);
	const int32 Storeys = FMath::Max(Plan.Storeys, 1);

	TArray<FKBVEWorldWallOpening> Openings;

	// The perimeter is carried across the walls and up through the storeys, so
	// the coursing is continuous around every corner and from one floor to the
	// next. Restarting it per wall is what makes a procedural building read as
	// four flats stood on end rather than as masonry.
	float Perimeter = 0.0f;

	for (int32 Level = 0; Level < Storeys; ++Level)
	{
		const float Base = Plan.Centre.Z + static_cast<float>(Level) * Storey;

		for (int32 Side = 0; Side < 4; ++Side)
		{
			FKBVEWorldWallBuild Wall;
			Wall.Start = Corners[Side];
			Wall.End = Corners[(Side + 1) % 4];
			Wall.Start.Z = Base;
			Wall.End.Z = Base;
			Wall.UOffset = Perimeter;

			// Only the ground floor stands on earth, so only it gets a plinth
			// and only it has anything to bury: an upper storey sits on the one
			// below, where a skirt of wider stone would read as a mistake.
			Wall.bPlinth = Level == 0;
			Wall.Embed = Level == 0 ? FMath::Max(Plan.Embed, 0.0f) : 0.0f;

			// A closed loop of walls, so nothing but the eaves and the ground is
			// ever an edge: the corners bury each other and every floor but the
			// last has another one sitting on it.
			Wall.bCapTop = Level == Storeys - 1;
			Wall.bCapBottom = Level == 0;
			Wall.bCapEnds = false;

			const float Length = FVector::Dist(Wall.Start, Wall.End);

			// A door on the ground floor of the front wall, which is the side
			// the building was turned towards the road.
			BayOpenings(Building, Length, Level == 0 && Side == 0, Openings);
			FKBVEWorldWall::Build(Building.Wall, Wall, Openings, Detail, Out);

			Perimeter += Length;
		}
	}
}
