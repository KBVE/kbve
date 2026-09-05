#include "KBVEWorldPlan.h"

#include "KBVEWorldHeightfield.h"

namespace
{
	/**
	 * The chunks around the origin, nearest first.
	 *
	 * Ordered rather than swept so the search stops at the closest answer, which
	 * keeps a start near the middle of the world instead of wherever the sweep
	 * happened to reach first -- and makes the whole thing a pure function of the
	 * seed rather than of the loop bounds.
	 */
	void RingsAround(int32 Radius, TArray<FIntPoint>& Out)
	{
		Out.Reset();
		for (int32 Y = -Radius; Y <= Radius; ++Y)
		{
			for (int32 X = -Radius; X <= Radius; ++X)
			{
				Out.Emplace(X, Y);
			}
		}
		Out.Sort([](const FIntPoint& A, const FIntPoint& B)
		{
			const int32 DA = A.X * A.X + A.Y * A.Y;
			const int32 DB = B.X * B.X + B.Y * B.Y;
			return DA != DB ? DA < DB : (A.X != B.X ? A.X < B.X : A.Y < B.Y);
		});
	}
}

bool FKBVEWorldPlanner::IsStandable(const FKBVEWorldPlanParams& Plan,
	const FKBVEWorldRoadParams& Road, const FKBVEWorldHeightfieldParams& Shape, int32 Seed,
	const FVector& Where, float& OutGroundZ)
{
	const float Tile = FMath::Max(Road.WorldUnitsPerTile, KINDA_SMALL_NUMBER);
	const float Pad = FMath::Max(Plan.PadRadius, 1.0f);

	// The middle and the four corners of the pad. Five samples rather than one
	// because a single height says nothing about whether it is a hilltop.
	const FVector2D Offsets[5] = { FVector2D(0.0f, 0.0f), FVector2D(-Pad, -Pad),
		FVector2D(Pad, -Pad), FVector2D(-Pad, Pad), FVector2D(Pad, Pad) };

	float Highest = -BIG_NUMBER;
	float Lowest = BIG_NUMBER;

	for (const FVector2D& Offset : Offsets)
	{
		const float X = Where.X + Offset.X;
		const float Y = Where.Y + Offset.Y;

		// A river carves its bed after the height is taken, so a point can be
		// well above the water line and still be in the middle of a channel.
		if (FKBVEWorldHeightfield::RiverMaskAt(Shape, Seed, X / Tile, Y / Tile) > 0.05f)
		{
			return false;
		}

		const float Z = FKBVEWorldHeightfield::HeightAt(Shape, Seed, X / Tile, Y / Tile);
		Highest = FMath::Max(Highest, Z);
		Lowest = FMath::Min(Lowest, Z);
	}

	if (Lowest < Shape.WaterZ + Plan.ClearOfWater)
	{
		return false;
	}
	if (Highest - Lowest > Plan.MaxFall)
	{
		return false;
	}

	OutGroundZ = Highest;
	return true;
}

FKBVEWorldPlan FKBVEWorldPlanner::Make(const FKBVEWorldPlanParams& Plan,
	const FKBVEWorldRoadParams& Road, const FKBVEWorldHeightfieldParams& Shape, int32 Seed)
{
	FKBVEWorldPlan Out;

	TArray<FIntPoint> Coords;
	RingsAround(FMath::Max(Plan.SearchRadiusChunks, 0), Coords);

	TArray<FVector> Path;
	float GroundZ = 0.0f;

	// A road first. The router already found ground it could cross, so a point on
	// one is level, dry and joined to the rest of the network -- and it is the
	// only kind of place a village can be, which is the whole reason to start
	// somewhere in particular rather than anywhere.
	for (const FIntPoint& Coord : Coords)
	{
		for (int32 Step = 0; Step < 2; ++Step)
		{
			const FIntPoint To = Coord + (Step == 0 ? FIntPoint(1, 0) : FIntPoint(0, 1));
			FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, Coord, To, Path);
			if (Path.Num() < 2)
			{
				continue;
			}

			for (const FVector& Point : Path)
			{
				if (IsStandable(Plan, Road, Shape, Seed, Point, GroundZ))
				{
					Out.Spawn = FVector(Point.X, Point.Y, GroundZ + Plan.Lift);
					Out.SpawnChunk = Coord;
					Out.bOnRoad = true;
					Out.bValid = true;
					return Out;
				}
			}
		}
	}

	// No road in reach was standable, so open country. The world is playable and
	// there is simply nothing near the start, which is worth being able to tell
	// apart from a seed that gave nowhere to stand at all.
	const float ChunkSize = FMath::Max(Road.TilesPerChunk * Road.WorldUnitsPerTile, 1.0f);
	for (const FIntPoint& Coord : Coords)
	{
		const FVector Centre((Coord.X + 0.5f) * ChunkSize, (Coord.Y + 0.5f) * ChunkSize, 0.0f);
		if (IsStandable(Plan, Road, Shape, Seed, Centre, GroundZ))
		{
			Out.Spawn = FVector(Centre.X, Centre.Y, GroundZ + Plan.Lift);
			Out.SpawnChunk = Coord;
			Out.bValid = true;
			return Out;
		}
	}

	return Out;
}
