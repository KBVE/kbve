#include "KBVEWorldHeightfield.h"
#include "KBVEWorldRoadGraph.h"
#include "KBVEWorldSettlement.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
	/** An edge that both carries a road and was built along, since most are neither. */
	bool FindBuiltEdge(const FKBVEWorldSettlementParams& Settlement,
		const FKBVEWorldRoadParams& Road, const FKBVEWorldHeightfieldParams& Shape, int32 Seed,
		FIntPoint& OutEdge, TArray<FVector>& OutPath, TArray<FKBVEWorldRoadSpan>& OutSpans,
		TArray<FKBVEWorldPlot>& OutPlots)
	{
		for (int32 X = -10; X <= 10; ++X)
		{
			for (int32 Y = -10; Y <= 10; ++Y)
			{
				const FIntPoint From(X, Y);
				FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, From, From + FIntPoint(1, 0),
					OutPath);
				if (OutPath.Num() < 2)
				{
					continue;
				}

				FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, OutPath, OutSpans);
				FKBVEWorldSettlement::FindPlots(Settlement, Road, Seed, From, OutPath, OutSpans,
					OutPlots);
				if (OutPlots.Num() > 0)
				{
					OutEdge = From;
					return true;
				}
			}
		}
		return false;
	}

	/** How far a point is from the nearest part of a polyline, ignoring height. */
	float DistanceToPath(const TArray<FVector>& Path, const FVector& Point)
	{
		float Best = BIG_NUMBER;
		for (int32 I = 1; I < Path.Num(); ++I)
		{
			const FVector A(Path[I - 1].X, Path[I - 1].Y, 0.0f);
			const FVector B(Path[I].X, Path[I].Y, 0.0f);
			const FVector P(Point.X, Point.Y, 0.0f);
			Best = FMath::Min(Best, FMath::PointDistToSegment(P, A, B));
		}
		return Best;
	}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldSettlementDeterminismTest,
	"KBVE.World.Settlement.PlotsAreDeterministic",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// A village is derived and never stored, so both ends of a connection work out
// where the houses are rather than being told. If the plots were not a pure
// function of the seed and the edge, a server and a client would raise different
// villages on the same road.
bool FKBVEWorldSettlementDeterminismTest::RunTest(const FString& Parameters)
{
	FKBVEWorldSettlementParams Settlement;
	const FKBVEWorldRoadParams Road;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	FIntPoint Edge;
	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;
	TArray<FKBVEWorldPlot> First;
	if (!TestTrue(TEXT("some edge was built along"),
		FindBuiltEdge(Settlement, Road, Shape, Seed, Edge, Path, Spans, First)))
	{
		return false;
	}

	TArray<FKBVEWorldPlot> Second;
	FKBVEWorldSettlement::FindPlots(Settlement, Road, Seed, Edge, Path, Spans, Second);

	TestEqual(TEXT("the same number of plots"), Second.Num(), First.Num());
	for (int32 I = 0; I < First.Num() && I < Second.Num(); ++I)
	{
		TestEqual(FString::Printf(TEXT("plot %d is in the same place"), I), Second[I].Along,
			First[I].Along);
		TestEqual(FString::Printf(TEXT("plot %d is on the same side"), I), Second[I].Side,
			First[I].Side);
	}

	// And the seed has to reach the plots at all, which is how this fails
	// silently: a settlement that ignored its stream would pass everything above.
	bool bDiffers = false;
	for (int32 Step = 1; Step < 24 && !bDiffers; ++Step)
	{
		TArray<FKBVEWorldPlot> Elsewhere;
		FKBVEWorldSettlement::FindPlots(Settlement, Road, Seed + Step, Edge, Path, Spans,
			Elsewhere);
		bDiffers = Elsewhere.Num() != First.Num()
			|| (Elsewhere.Num() > 0 && !FMath::IsNearlyEqual(Elsewhere[0].Along, First[0].Along));
	}
	TestTrue(TEXT("another seed is another settlement"), bDiffers);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldSettlementSitingTest,
	"KBVE.World.Settlement.BuildingsStandOffTheRoad",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// Two things a sited building must not do, and both of them are invisible until
// somebody drives down the road: stand in the carriageway, and stand on a
// crossing. The first is what the setback is for and the second is why the plots
// know where the bridges are.
bool FKBVEWorldSettlementSitingTest::RunTest(const FString& Parameters)
{
	FKBVEWorldSettlementParams Settlement;

	// Build along everything, so the test is about siting rather than about
	// whether the coverage roll happened to leave the interesting edges alone.
	Settlement.Chance = 1.0f;

	const FKBVEWorldRoadParams Road;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	int32 Sited = 0;
	int32 Refused = 0;
	int32 OnCrossings = 0;
	float Nearest = BIG_NUMBER;

	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;
	TArray<FKBVEWorldPlot> Plots;

	for (int32 X = -5; X <= 5; ++X)
	{
		for (int32 Y = -5; Y <= 5; ++Y)
		{
			const FIntPoint Edge(X, Y);
			FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, Edge, Edge + FIntPoint(1, 0), Path);
			if (Path.Num() < 2)
			{
				continue;
			}

			FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, Path, Spans);
			FKBVEWorldSettlement::FindPlots(Settlement, Road, Seed, Edge, Path, Spans, Plots);

			TArray<float> Along;
			Along.SetNumUninitialized(Path.Num());
			Along[0] = 0.0f;
			for (int32 I = 1; I < Path.Num(); ++I)
			{
				Along[I] = Along[I - 1] + FVector::Dist2D(Path[I - 1], Path[I]);
			}

			for (const FKBVEWorldPlot& Plot : Plots)
			{
				for (const FKBVEWorldRoadSpan& Span : Spans)
				{
					if (Span.Begin >= Along.Num() || Span.End >= Along.Num())
					{
						continue;
					}
					const float Reach = 0.5f * Settlement.Building.MaxWidth;
					if (Plot.Along - Reach < Along[Span.End]
						&& Plot.Along + Reach > Along[Span.Begin])
					{
						++OnCrossings;
					}
				}

				FKBVEWorldBuildingPlan Plan;
				if (!FKBVEWorldSettlement::Site(Settlement, Road, Shape, Seed, nullptr, Path, Plot,
					Plan))
				{
					++Refused;
					continue;
				}
				++Sited;

				FVector Corners[4];
				FKBVEWorldBuilding::Footprint(Plan, Corners);
				for (const FVector& Corner : Corners)
				{
					Nearest = FMath::Min(Nearest, DistanceToPath(Path, Corner));
				}
			}
		}
	}

	AddInfo(FString::Printf(TEXT("%d buildings sited, %d refused for slope, nearest %.0f from the road"),
		Sited, Refused, Nearest));

	TestTrue(TEXT("the sweep raised some buildings"), Sited > 0);
	TestEqual(TEXT("no plot sits on a crossing"), OnCrossings, 0);
	TestTrue(TEXT("no corner stands in the carriageway"), Nearest > Road.CutFlatHalfWidth);

	return true;
}

#endif
