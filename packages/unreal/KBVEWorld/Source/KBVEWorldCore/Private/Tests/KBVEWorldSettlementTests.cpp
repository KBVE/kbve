#include "KBVEWorldFence.h"
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
	int32 Stepped = 0;
	int32 Unreachable = 0;
	float Nearest = BIG_NUMBER;
	float DeepestDoor = 0.0f;

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

				// A doorway is only a doorway if it can be walked through, and on
				// a slope the floor is levelled above the ground outside it. What
				// makes that reachable is the flight of steps, and what makes the
				// flight reach is the plot having been refused before the drop
				// outgrew it -- two limits in two different structs that have to
				// agree, and nothing but this notices when they stop agreeing.
				const FKBVEWorldStairParams& Stair = Settlement.Building.Stair;
				const int32 Steps = FKBVEWorldStair::Count(Stair, Plan.DoorDrop);
				DeepestDoor = FMath::Max(DeepestDoor, Plan.DoorDrop);
				Stepped += Steps > 0 ? 1 : 0;

				// Too steep to climb, or long enough to end in the carriageway.
				// Both are the same failure seen from either end -- a flight has
				// only so much ground to work in and only so much it can do with
				// it -- and both are invisible from anywhere but the doorstep.
				const float Riser =
					Steps > 0 ? Plan.DoorDrop / static_cast<float>(Steps) : 0.0f;
				if (Riser > Stair.MaxRiser + KINDA_SMALL_NUMBER
					|| FKBVEWorldStair::Run(Stair, Plan.DoorDrop)
						> Settlement.Setback - Road.CutFlatHalfWidth)
				{
					++Unreachable;
				}

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
	AddInfo(FString::Printf(TEXT("%d of %d doors need steps, deepest drop %.0f"), Stepped, Sited,
		DeepestDoor));

	TestTrue(TEXT("the sweep raised some buildings"), Sited > 0);
	TestEqual(TEXT("no plot sits on a crossing"), OnCrossings, 0);
	TestTrue(TEXT("no corner stands in the carriageway"), Nearest > Road.CutFlatHalfWidth);
	TestEqual(TEXT("every sited door has a flight that reaches it"), Unreachable, 0);

	// And the drop is real on most of them, or the steps are being tested against
	// a plain: a terrain that happened to be flat under every plot would pass the
	// check above without any of this having been exercised at all.
	TestTrue(TEXT("the terrain does put doors above their own ground"), Stepped > Sited / 4);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldSettlementGatewayTest,
	"KBVE.World.Settlement.TheGatewayIsInFrontOfTheDoor",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The gap a fence leaves has to be in front of the doorstep, not in front of the
// middle of the house. Bays put the door off centre whenever there is an even
// number of them, and siting moves a house up and down the road looking for
// level ground, so neither the plot's distance nor the plan's centre is where
// somebody actually walks out.
//
// Measured by finding the door on the road independently -- the nearest point of
// the polyline to the doorway itself -- rather than by repeating the projection
// the answer was built with.
bool FKBVEWorldSettlementGatewayTest::RunTest(const FString& Parameters)
{
	FKBVEWorldSettlementParams Settlement;
	Settlement.Chance = 1.0f;

	FKBVEWorldFenceParams Fence;

	const FKBVEWorldRoadParams Road;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(20260906);

	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;
	TArray<FKBVEWorldPlot> Plots;

	int32 Checked = 0;
	int32 Missed = 0;
	int32 Narrow = 0;
	int32 OffCentre = 0;

	for (int32 X = -4; X <= 4; ++X)
	{
		for (int32 Y = -4; Y <= 4; ++Y)
		{
			const FIntPoint Edge(X, Y);
			FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, Edge, Edge + FIntPoint(1, 0), Path);
			if (Path.Num() < 2)
			{
				continue;
			}

			FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, Path, Spans);
			FKBVEWorldSettlement::FindPlots(Settlement, Road, Seed, Edge, Path, Spans, Plots);

			for (const FKBVEWorldPlot& Plot : Plots)
			{
				FKBVEWorldBuildingPlan Plan;
				if (!FKBVEWorldSettlement::Site(Settlement, Road, Shape, Seed, nullptr, Path,
					Plot, Plan))
				{
					continue;
				}

				float Begin = 0.0f;
				float End = 0.0f;
				FKBVEWorldSettlement::Gateway(Settlement.Building, Plan, Path,
					Fence.GateClearance, Begin, End);

				FVector Doorway;
				FVector Forward;
				FKBVEWorldBuilding::Door(Settlement.Building, Plan, Doorway, Forward);

				// Where the doorstep is on the road, found the slow honest way.
				float Travelled = 0.0f;
				float AtDoor = 0.0f;
				float Nearest = BIG_NUMBER;
				for (int32 I = 1; I < Path.Num(); ++I)
				{
					const FVector A = Path[I - 1];
					const FVector B = Path[I];
					const FVector Leg = B - A;
					const float Length = Leg.Size2D();
					if (Length > KINDA_SMALL_NUMBER)
					{
						const float T = FMath::Clamp(
							static_cast<float>(FVector::DotProduct(
								FVector(Doorway.X - A.X, Doorway.Y - A.Y, 0.0),
								FVector(Leg.X, Leg.Y, 0.0))) / (Length * Length),
							0.0f, 1.0f);
						const FVector On = A + Leg * T;
						const float Distance = FVector::Dist2D(On, Doorway);
						if (Distance < Nearest)
						{
							Nearest = Distance;
							AtDoor = Travelled + T * Length;
						}
					}
					Travelled += Length;
				}

				++Checked;
				Missed += (AtDoor < Begin || AtDoor > End) ? 1 : 0;
				Narrow += (End - Begin < Settlement.Building.DoorWidth) ? 1 : 0;

				// And it is the door the gap is centred on, not the house. On an
				// even bay count those are not the same place, and a gap centred
				// on the wrong one puts a post on the doorstep.
				OffCentre += FMath::Abs(0.5f * (Begin + End) - AtDoor) > 1.0f ? 1 : 0;
			}
		}
	}

	TestTrue(TEXT("there were villages to check"), Checked > 0);
	TestEqual(TEXT("every doorstep is inside its gateway"), Missed, 0);
	TestEqual(TEXT("no gateway is narrower than the door"), Narrow, 0);
	TestEqual(TEXT("every gateway is centred on its door"), OffCentre, 0);
	AddInfo(FString::Printf(TEXT("%d doorways checked"), Checked));

	return true;
}

#endif
