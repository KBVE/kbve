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

	/** Where a distance down a routed edge falls, measured the way the plots are. */
	FVector PointAlong(const TArray<FVector>& Path, float Distance)
	{
		float Walked = 0.0f;
		for (int32 I = 1; I < Path.Num(); ++I)
		{
			const float Segment = FVector::Dist2D(Path[I - 1], Path[I]);
			if (Walked + Segment >= Distance)
			{
				const float Frac = FMath::Clamp(
					(Distance - Walked) / FMath::Max(Segment, KINDA_SMALL_NUMBER), 0.0f, 1.0f);
				return FMath::Lerp(Path[I - 1], Path[I], Frac);
			}
			Walked += Segment;
		}
		return Path.Last();
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
	const FKBVEWorldRoadParams& Road, const FKBVEWorldHeightfieldParams& Shape, int32 Seed,
	const FKBVEWorldSettlementParams* Settlement)
{
	FKBVEWorldPlan Out;

	TArray<FIntPoint> Coords;
	RingsAround(FMath::Max(Plan.SearchRadiusChunks, 0), Coords);

	TArray<FVector> Path;
	float GroundZ = 0.0f;

	// A village first, and over a far wider reach than the passes below. Both of
	// those answer "somewhere a person can stand", and most of the world is that;
	// what a world opens on should be the one part of it that was built to be
	// stood in. The world has no edge to run out of, so looking further is only a
	// question of what it costs -- and whether an edge carries a settlement is a
	// hash, so the sweep routes only the roads that have one and stops at the
	// first village it can put somebody in.
	//
	// Nothing here is a second opinion about where the houses are: the same edge
	// key, the same routed polyline, the same plot walk and the same siting the
	// chunks use, so the start is the middle of a street that will be raised
	// around it rather than near one.
	if (Settlement)
	{
		TArray<FIntPoint> Wide;
		RingsAround(FMath::Max(Plan.SettlementSearchRadiusChunks, 0), Wide);

		TArray<FKBVEWorldRoadSpan> Spans;
		TArray<FKBVEWorldPlot> Plots;
		TArray<float> Standing;

		const float Tile = FMath::Max(Road.WorldUnitsPerTile, KINDA_SMALL_NUMBER);
		int32 Probes = 0;

		for (const FIntPoint& Coord : Wide)
		{
			if (Probes >= Plan.MaxSettlementProbes)
			{
				break;
			}

			for (int32 Step = 0; Step < 2; ++Step)
			{
				const FIntPoint Key(Coord.X, Coord.Y * 2 + Step);
				if (!FKBVEWorldSettlement::HasPlots(*Settlement, Seed, Key))
				{
					continue;
				}

				++Probes;
				const FIntPoint To = Coord + (Step == 0 ? FIntPoint(1, 0) : FIntPoint(0, 1));
				FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, Coord, To, Path);
				if (Path.Num() < 2)
				{
					continue;
				}

				FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, Path, Spans);
				FKBVEWorldSettlement::FindPlots(*Settlement, Road, Seed, Key, Path, Spans, Plots);

				// Sited, not merely plotted. A plot is where a house would go and
				// the ground decides how many can, so on steep country a fourteen
				// plot village raises two cottages -- and a start planned off the
				// plots alone lands in the gaps. Without the road field this
				// measures ungraded ground, which refuses plots the chunk will
				// accept: the count is a floor on what gets built, never a claim.
				Standing.Reset();
				for (const FKBVEWorldPlot& Plot : Plots)
				{
					FKBVEWorldBuildingPlan Sited;
					if (FKBVEWorldSettlement::Site(*Settlement, Road, Shape, Seed, nullptr, Path,
						Plot, Sited))
					{
						Standing.Add(Plot.Along);
					}
				}

				if (Standing.Num() < Plan.MinBuildings)
				{
					continue;
				}

				// The middle of what stands, so the start is among the houses
				// rather than at the last one on the edge of the village.
				const FVector Where = PointAlong(Path, Standing[Standing.Num() / 2]);

				// Not the pad test the open country passes use. That samples the
				// raw heightfield, and a street is graded: a road cut through a
				// hillside reads as a cliff to it and the village it runs through
				// gets refused for being on the ground it flattened. What is left
				// is what a road cannot fix -- standing in a channel, or below the
				// water -- and the houses either side are the proof of the rest.
				if (FKBVEWorldHeightfield::RiverMaskAt(Shape, Seed, Where.X / Tile, Where.Y / Tile)
					> 0.05f)
				{
					continue;
				}
				if (Where.Z < Shape.WaterZ + Plan.ClearOfWater)
				{
					continue;
				}

				Out.Spawn = FVector(Where.X, Where.Y, Where.Z + Plan.Lift);
				Out.SpawnChunk = Coord;
				Out.bOnRoad = true;
				Out.bInSettlement = true;
				Out.Buildings = Standing.Num();
				Out.bValid = true;
				return Out;
			}
		}
	}

	// A road next. The router already found ground it could cross, so a point on
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
