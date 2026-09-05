#include "KBVEWorldSettlement.h"

#include "KBVEWorldHeightfield.h"

namespace
{
	// A settlement's own stream. Adding a decision to the fences must not move
	// the villages, which is the failure that shows up as two builds disagreeing
	// about where a town is.
	uint32 PlotHash(int32 Seed, const FIntPoint& Edge, int32 Salt)
	{
		uint32 H = static_cast<uint32>(Seed) ^ 0x632BE5ABu;
		H = (H ^ static_cast<uint32>(Edge.X)) * 0x85EBCA6Bu;
		H = (H ^ static_cast<uint32>(Edge.Y)) * 0xC2B2AE35u;
		H = (H ^ static_cast<uint32>(Salt)) * 0x27D4EB2Fu;
		H ^= H >> 15;
		return H;
	}

	float Unit(uint32 H)
	{
		return static_cast<float>(H & 0x00FFFFFFu) / static_cast<float>(0x01000000u);
	}

	void MeasureAlong(const TArray<FVector>& Path, TArray<float>& OutAlong)
	{
		OutAlong.SetNumUninitialized(Path.Num());
		OutAlong[0] = 0.0f;
		for (int32 I = 1; I < Path.Num(); ++I)
		{
			OutAlong[I] = OutAlong[I - 1] + FVector::Dist2D(Path[I - 1], Path[I]);
		}
	}

	void SampleAt(const TArray<FVector>& Path, const TArray<float>& Along, float Distance,
		FVector& OutPoint, FVector& OutTangent)
	{
		int32 I = 1;
		while (I < Path.Num() - 1 && Along[I] < Distance)
		{
			++I;
		}

		const float Segment = FMath::Max(Along[I] - Along[I - 1], KINDA_SMALL_NUMBER);
		const float Frac = FMath::Clamp((Distance - Along[I - 1]) / Segment, 0.0f, 1.0f);
		OutPoint = FMath::Lerp(Path[I - 1], Path[I], Frac);
		OutTangent = (Path[I] - Path[I - 1]).GetSafeNormal();
	}
}

void FKBVEWorldSettlement::FindPlots(const FKBVEWorldSettlementParams& Settlement,
	const FKBVEWorldRoadParams& Road, int32 Seed, const FIntPoint& Edge,
	const TArray<FVector>& Path, const TArray<FKBVEWorldRoadSpan>& Spans,
	TArray<FKBVEWorldPlot>& OutPlots)
{
	OutPlots.Reset();
	if (Path.Num() < 2 || Settlement.Chance <= 0.0f)
	{
		return;
	}

	// The whole edge or none of it. Rolling per plot instead would scatter single
	// houses evenly down every road in the world, which is a countryside of
	// hermits rather than a map with villages on it.
	if (Unit(PlotHash(Seed, Edge, 0)) >= Settlement.Chance)
	{
		return;
	}

	TArray<float> Along;
	MeasureAlong(Path, Along);
	const float Total = Along.Last();

	TArray<FVector2D> Blocked;
	for (const FKBVEWorldRoadSpan& Span : Spans)
	{
		if (Span.Begin < Along.Num() && Span.End < Along.Num())
		{
			Blocked.Emplace(Along[Span.Begin], Along[Span.End]);
		}
	}

	const float Reach = 0.5f * FMath::Max(Settlement.Building.MaxWidth, 0.0f);
	auto IsBlocked = [&Blocked, Reach](float At)
	{
		for (const FVector2D& Span : Blocked)
		{
			if (At - Reach < Span.Y && At + Reach > Span.X)
			{
				return true;
			}
		}
		return false;
	};

	// Walked down the road rather than sliced into equal plots, so the gaps
	// between the houses are their own. A settlement whose buildings sit on a
	// pitch reads as having been laid out by a surveyor, which is a very
	// particular kind of place and not the default one.
	float Cursor = Reach + Settlement.MinGap;
	int32 Step = 0;

	while (Cursor < Total - Reach && OutPlots.Num() < Settlement.MaxPlots && Step < 64)
	{
		const uint32 H = PlotHash(Seed, Edge, 17 + Step * 41);
		++Step;

		if (!IsBlocked(Cursor))
		{
			FKBVEWorldPlot& Plot = OutPlots.AddDefaulted_GetRef();
			Plot.Along = Cursor;
			Plot.Side = Unit(PlotHash(Seed, Edge, 19 + Step * 41)) < 0.5f ? -1.0f : 1.0f;
			Plot.Seed = static_cast<int32>(H);
		}

		Cursor += 2.0f * Reach
			+ FMath::Lerp(Settlement.MinGap, Settlement.MaxGap,
				Unit(PlotHash(Seed, Edge, 23 + Step * 41)));
	}
}

bool FKBVEWorldSettlement::Site(const FKBVEWorldSettlementParams& Settlement,
	const FKBVEWorldRoadParams& Road, const FKBVEWorldHeightfieldParams& Shape, int32 Seed,
	const FKBVEWorldRoadField* Field, const TArray<FVector>& Path, const FKBVEWorldPlot& Plot,
	FKBVEWorldBuildingPlan& OutPlan)
{
	if (Path.Num() < 2)
	{
		return false;
	}

	TArray<float> Along;
	MeasureAlong(Path, Along);

	// The same graded surface the road was levelled onto, so a house beside a
	// cutting stands on the ground as it now is rather than as the noise left it.
	auto GroundAt = [&](const FVector& P)
	{
		const float Base = FKBVEWorldHeightfield::HeightAt(Shape, Seed,
			P.X / Road.WorldUnitsPerTile, P.Y / Road.WorldUnitsPerTile);
		return Field ? Field->Level(Base, P.X, P.Y) : Base;
	};

	// Dimensions first and once: a plot that changed shape as it looked for
	// ground would be searching for somewhere a different building fits.
	FKBVEWorldBuildingPlan Plan = FKBVEWorldBuilding::Plan(Settlement.Building, Plot.Seed,
		FVector::ZeroVector, 0.0f);

	auto Consider = [&](float Offset, FKBVEWorldBuildingPlan& Out, float& OutFall)
	{
		FVector Point;
		FVector Tangent;
		SampleAt(Path, Along, Plot.Along + Offset, Point, Tangent);

		const FVector Across(Tangent.Y, -Tangent.X, 0.0f);

		// Turned to face the road, which is what the front wall and its door mean.
		// A building on the far side looks back across, so the two rows of a street
		// face each other rather than both facing the same way down it.
		Out = Plan;
		Out.Yaw = FMath::Atan2(-Across.Y * Plot.Side, -Across.X * Plot.Side);

		const FVector Centre =
			Point + Across * (Plot.Side * (Settlement.Setback + 0.5f * Out.Depth));
		Out.Centre = FVector(Centre.X, Centre.Y, 0.0f);

		FVector Corners[4];
		FKBVEWorldBuilding::Footprint(Out, Corners);

		float Highest = -BIG_NUMBER;
		float Lowest = BIG_NUMBER;
		for (const FVector& Corner : Corners)
		{
			const float Z = GroundAt(Corner);
			Highest = FMath::Max(Highest, Z);
			Lowest = FMath::Min(Lowest, Z);
		}

		// Levelled to the highest corner and sunk to the lowest. Either alone is a
		// visible failure: the floor at the mean leaves one corner of the building
		// in the air, and a plinth cut to the mean leaves daylight under the other.
		Out.Centre.Z = Highest;
		OutFall = Highest - Lowest;
		Out.Embed = OutFall + Settlement.Building.Wall.PlinthHeight;
	};

	// Look up and down the road a little for flatter ground before giving up.
	//
	// Without this a plot takes whatever the walk happened to land on, and on
	// anything but a plain most of them land on a slope and are refused -- which
	// is a village of gaps rather than a village. The window is kept under the
	// spacing so two neighbours searching towards each other still cannot meet.
	const float Span = 0.35f * FMath::Max(Settlement.MinGap, 0.0f);
	const float Offsets[5] = { 0.0f, 0.5f * Span, -0.5f * Span, Span, -Span };

	FKBVEWorldBuildingPlan Best;
	float BestFall = BIG_NUMBER;

	for (const float Offset : Offsets)
	{
		FKBVEWorldBuildingPlan Candidate;
		float Fall = BIG_NUMBER;
		Consider(Offset, Candidate, Fall);

		if (Fall < BestFall)
		{
			BestFall = Fall;
			Best = Candidate;
		}

		// The nominal spot wins outright when it is good enough, so a settlement
		// on level ground keeps the spacing the walk gave it rather than drifting.
		if (Fall <= Settlement.MaxFall && Offset == 0.0f)
		{
			break;
		}
	}

	if (BestFall > Settlement.MaxFall)
	{
		return false;
	}

	OutPlan = Best;
	return true;
}
