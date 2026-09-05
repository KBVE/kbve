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
	int32 BayCount(const FKBVEWorldBuildingParams& Building, float Length)
	{
		const float Bay = FMath::Max(Building.BayWidth, KINDA_SMALL_NUMBER);
		return FMath::Max(FMath::RoundToInt(Length / Bay), 1);
	}

	void BayOpenings(const FKBVEWorldBuildingParams& Building, float Length, bool bDoor,
		TArray<FKBVEWorldWallOpening>& Out)
	{
		Out.Reset();

		const int32 Bays = BayCount(Building, Length);
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

float FKBVEWorldBuilding::DoorAlong(const FKBVEWorldBuildingParams& Building, float Length)
{
	const int32 Bays = BayCount(Building, Length);
	return (static_cast<float>(Bays / 2) + 0.5f) * Length / static_cast<float>(Bays);
}

void FKBVEWorldBuilding::Door(const FKBVEWorldBuildingParams& Building,
	const FKBVEWorldBuildingPlan& Plan, FVector& OutPoint, FVector& OutForward)
{
	FVector Corners[4];
	Footprint(Plan, Corners);

	// The front wall, which is the one the footprint starts on and the one the
	// building was turned to face the road with.
	const FVector Along = Corners[1] - Corners[0];
	const float Length = Along.Size();
	const FVector Right = Length > KINDA_SMALL_NUMBER ? Along / Length : FVector::RightVector;

	OutForward = FVector::CrossProduct(Right, FVector::UpVector).GetSafeNormal();
	OutPoint = Corners[0] + Right * DoorAlong(Building, Length);
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
	const FKBVEWorldBuildingPlan& Plan, EKBVEWorldWallDetail Detail, FKBVEWorldBuildingMesh& Out)
{
	FVector Corners[4];
	Footprint(Plan, Corners);

	const float Storey = FMath::Max(Building.Wall.Height, KINDA_SMALL_NUMBER);
	const int32 Storeys = FMath::Max(Plan.Storeys, 1);

	const bool bGable =
		FKBVEWorldRoof::StyleFor(Building.Roof, Plan.Seed) == EKBVEWorldRoofStyle::Gable;

	// Where the masonry has to stop to meet the underside of the slope. The roof
	// slab has thickness measured vertically, so its soffit is already below the
	// wall plate at the wall line -- carried to the corner, a gable end would come
	// up through the roof it is meant to be closing.
	const float Pitch = FMath::DegreesToRadians(FMath::Clamp(Building.Roof.Pitch, 1.0f, 85.0f));
	const float Slope = FMath::Tan(Pitch);
	const float Deep = FMath::Max(Building.Roof.Thickness, 0.0f);
	const float Skin = 0.5f * FMath::Max(Building.Wall.Thickness, KINDA_SMALL_NUMBER);

	// How far the roof stands above the footprint the walls are built along.
	//
	// The roof is given that same footprint, and a slope crossing it is at the
	// plate on the line and below it outside -- so the outer half of every wall
	// under an eave stands up through the tiles, by the drop across half a wall.
	// Lifting the roof by that drop plus its own thickness puts its underside on
	// top of the wall at the outer face, which is where a wall plate is.
	const float Lift = Deep + Slope * Skin;

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
			// The top storey included: the roof slab's soffit sits below the plate
			// at the wall line, so the top of the wall is inside the roof.
			// The top of the top storey is now under the roof rather than in it,
			// so it is an edge again and gets closed -- except where the gable
			// carries the masonry on past it, which would bury the cap in stone.
			const bool bUnderRoof = Level == Storeys - 1;
			const bool bRakes = bGable && bUnderRoof && (Side == 1 || Side == 3);
			Wall.bCapTop = bUnderRoof && !bRakes;
			Wall.bCapBottom = Level == 0;
			Wall.bCapEnds = false;

			const float Length = FVector::Dist(Wall.Start, Wall.End);

			// A door on the ground floor of the front wall, which is the side
			// the building was turned towards the road.
			BayOpenings(Building, Length, Level == 0 && Side == 0, Openings);
			FKBVEWorldWall::Build(Building.Wall, Wall, Openings, Detail, Out.Masonry);

			// The ridge runs across the front, so the two walls that meet the
			// slopes end-on are the ones running back from it. A hip closes its own
			// ends and wants no masonry above the plate at all.
			// The gable follows the roof's underside up to the ridge, and with the
			// roof standing on the outer face there is nothing left to inset from:
			// the soffit clears the plate at the corner, so the masonry runs the
			// whole length of the wall and meets the slope only at the peak.
			if (bRakes)
			{
				FKBVEWorldWall::Gable(Building.Wall, Wall,
					FKBVEWorldRoof::Rise(Building.Roof, Plan.Depth) + Slope * Skin, 0.0f,
					Out.Masonry);
			}

			Perimeter += Length;
		}
	}

	const float Half = 0.5f * FMath::Max(Building.Wall.Thickness, KINDA_SMALL_NUMBER);

	// A floor, which is the difference between a building and four walls. Two
	// triangles: the plinth already closes the sides of the pad it sits on, so
	// all that is missing is the top -- and without it a doorway on a slope opens
	// onto the hole between the floor level and the ground it was levelled above.
	FKBVEWorldBuildingPlan Inside = Plan;
	Inside.Width = FMath::Max(Plan.Width - 2.0f * Half, 0.0f);
	Inside.Depth = FMath::Max(Plan.Depth - 2.0f * Half, 0.0f);
	if (Inside.Width > 0.0f && Inside.Depth > 0.0f)
	{
		FVector Floor[4];
		Footprint(Inside, Floor);

		const float Tile = FMath::Max(Building.Wall.TileLength, KINDA_SMALL_NUMBER);
		const float W = Inside.Width / Tile;
		const float D = Inside.Depth / Tile;
		FKBVEWorldRibbon::AppendQuad(Out.Masonry, Floor[0], Floor[1], Floor[2], Floor[3],
			FVector2D(0.0f, 0.0f), FVector2D(W, 0.0f), FVector2D(W, D), FVector2D(0.0f, D));
	}

	// Steps up to the front door.
	//
	// Built from the opening the wall actually placed rather than the one that
	// was asked for, because a door near the end of a short wall is moved to
	// leave a pier beside it -- and a flight in front of where the door was going
	// to be is worse than none. Skipped at the coarsest tier along with the
	// openings it would serve: there is no doorway there to reach.
	if (Detail != EKBVEWorldWallDetail::Solid && Plan.DoorDrop > KINDA_SMALL_NUMBER)
	{
		const float Front = FVector::Dist(Corners[0], Corners[1]);
		BayOpenings(Building, Front, true, Openings);

		TArray<FKBVEWorldWallPanel> Panels;
		TArray<FKBVEWorldWallOpening> Placed;
		FKBVEWorldWall::Panels(Building.Wall, Front, Openings, Detail, Panels, Placed);

		for (const FKBVEWorldWallOpening& Open : Placed)
		{
			if (Open.Bottom > 0.0f)
			{
				continue;
			}

			FVector Point;
			FVector Forward;
			Door(Building, Plan, Point, Forward);

			FKBVEWorldStairBuild Steps;
			Steps.Right = (Corners[1] - Corners[0]).GetSafeNormal();
			Steps.Out = Forward;

			// Off the front of the plinth rather than the wall, so the top tread
			// meets the plinth's own top face instead of lying on it -- two
			// coincident surfaces across the width of every doorway in the
			// village would z-fight from the one angle a doorway is looked at.
			Steps.Origin = Corners[0] + Steps.Right * Open.Along
				+ Forward * (Half + FMath::Max(Building.Wall.PlinthOverhang, 0.0f));
			Steps.Origin.Z = Plan.Centre.Z;

			Steps.Width = Open.Width;
			Steps.Rise = Plan.DoorDrop;
			Steps.TileLength = Building.Wall.TileLength;

			FKBVEWorldStair::Build(Building.Stair, Steps, Out.Masonry);
			break;
		}
	}

	FKBVEWorldRoofBuild RoofIn;
	RoofIn.Centre = FVector(Plan.Centre.X, Plan.Centre.Y,
		Plan.Centre.Z + static_cast<float>(Storeys) * Storey + Lift);
	RoofIn.Yaw = Plan.Yaw;
	RoofIn.Width = Plan.Width;
	RoofIn.Depth = Plan.Depth;
	RoofIn.Seed = Plan.Seed;

	// Built at every level of detail, unlike the trim. A roof is most of what a
	// building is from any distance at which the building is a shape at all --
	// dropping it is how a village at range becomes a field of brick boxes.
	FKBVEWorldRoof::Build(Building.Roof, RoofIn, Out.Roof);
}
