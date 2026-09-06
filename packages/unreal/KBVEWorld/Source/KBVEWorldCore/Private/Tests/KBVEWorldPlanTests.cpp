#include "KBVEWorldHeightfield.h"
#include "KBVEWorldPlan.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldPlanStartTest,
	"KBVE.World.Plan.StartsSomewhereStandable",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The one thing that has to be right before a world can be entered at all. A
// fixed start in an authored level knows nothing about what the seed made where
// it is standing, so it lands in a river or on a cliff as often as the terrain
// happens to put one there -- and it is the first thing anybody sees.
bool FKBVEWorldPlanStartTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldPlanParams Plan;
	const FKBVEWorldRoadParams Road;
	const FKBVEWorldHeightfieldParams Shape;

	int32 Found = 0;
	int32 OnRoad = 0;

	for (int32 World = 0; World < 24; ++World)
	{
		const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1000 + World * 7919);
		const FKBVEWorldPlan Made = FKBVEWorldPlanner::Make(Plan, Road, Shape, Seed);
		if (!Made.bValid)
		{
			continue;
		}

		++Found;
		OnRoad += Made.bOnRoad ? 1 : 0;

		// Whatever the search returned has to pass the test the search used, at
		// the point it actually returned rather than at the one it examined.
		float GroundZ = 0.0f;
		TestTrue(TEXT("the start is standable"),
			FKBVEWorldPlanner::IsStandable(Plan, Road, Shape, Seed, Made.Spawn, GroundZ));

		// Above the ground rather than inside it: a pawn spawned level with the
		// surface starts the game interpenetrating the collision it lands on.
		TestTrue(TEXT("the start is above the ground"), Made.Spawn.Z > GroundZ);
		TestTrue(TEXT("the start is clear of the water"),
			Made.Spawn.Z > Shape.WaterZ + Plan.ClearOfWater);
	}

	AddInfo(FString::Printf(TEXT("%d of 24 seeds gave a start, %d of those on the network"),
		Found, OnRoad));

	// Not every seed has to oblige, but a heightfield that almost never offers
	// anywhere to stand would mean the test is measuring the search rather than
	// the terrain -- and the search would be the thing that is wrong.
	TestTrue(TEXT("most seeds give somewhere to start"), Found >= 20);
	TestTrue(TEXT("the roads are usually reachable from the start"), OnRoad >= Found / 2);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldPlanDeterminismTest,
	"KBVE.World.Plan.StartIsDeterministic",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The plan is a cache of the seed and never authored data, which is what lets a
// server and a client work out the same start without agreeing on one. If it
// drifted, two players joining the same world would begin in different places
// and the world would have to start being sent rather than derived.
bool FKBVEWorldPlanDeterminismTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldPlanParams Plan;
	const FKBVEWorldRoadParams Road;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	const FKBVEWorldPlan First = FKBVEWorldPlanner::Make(Plan, Road, Shape, Seed);
	const FKBVEWorldPlan Again = FKBVEWorldPlanner::Make(Plan, Road, Shape, Seed);

	TestTrue(TEXT("the seed gave a start"), First.bValid);
	TestEqual(TEXT("the same seed starts in the same place"), Again.Spawn, First.Spawn);
	TestEqual(TEXT("the same seed starts in the same chunk"), Again.SpawnChunk, First.SpawnChunk);

	// And the seed has to reach it, which is how this fails quietly: a start
	// fixed at the origin would pass everything above.
	bool bDiffers = false;
	for (int32 Step = 1; Step < 16 && !bDiffers; ++Step)
	{
		const FKBVEWorldPlan Other = FKBVEWorldPlanner::Make(Plan, Road, Shape, Seed + Step);
		bDiffers = Other.bValid && !Other.Spawn.Equals(First.Spawn, 1.0f);
	}
	TestTrue(TEXT("another seed starts somewhere else"), bDiffers);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldPlanVillageStartTest,
	"KBVE.World.Plan.StartsInASettlement",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// Where a world opens. A start on bare road is somewhere connected, which the
// road pass already guaranteed; what a player should be looking at is the one
// part of the world that was built to be stood in. The check that matters is not
// that the flag is set but that the point is where the chunks will raise houses:
// the plan and the chunk have to walk the same edge key and the same plots, or
// the spawn is in an empty field with the village next door.
bool FKBVEWorldPlanVillageStartTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldPlanParams Plan;
	const FKBVEWorldRoadParams Road;
	const FKBVEWorldHeightfieldParams Shape;
	const FKBVEWorldSettlementParams Settlement;

	int32 InVillage = 0;

	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;
	TArray<FKBVEWorldPlot> Plots;

	for (int32 World = 0; World < 24; ++World)
	{
		const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1000 + World * 7919);
		const FKBVEWorldPlan Made = FKBVEWorldPlanner::Make(Plan, Road, Shape, Seed, &Settlement);

		TestTrue(TEXT("the seed gave a start"), Made.bValid);
		if (!Made.bValid || !Made.bInSettlement)
		{
			continue;
		}

		++InVillage;
		TestTrue(TEXT("a settlement start is on the network"), Made.bOnRoad);
		TestTrue(TEXT("the start has houses around it"), Made.Buildings >= Plan.MinBuildings);

		// The chunk's own reckoning, run again from the spawn chunk: one of that
		// chunk's two edges has to carry plots that stand, and one of those has to
		// be near what the plan returned.
		int32 Standing = 0;
		float Nearest = BIG_NUMBER;

		for (int32 Step = 0; Step < 2; ++Step)
		{
			const FIntPoint To = Made.SpawnChunk + (Step == 0 ? FIntPoint(1, 0) : FIntPoint(0, 1));
			FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, Made.SpawnChunk, To, Path);
			if (Path.Num() < 2)
			{
				continue;
			}

			FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, Path, Spans);
			const FIntPoint Key(Made.SpawnChunk.X, Made.SpawnChunk.Y * 2 + Step);
			FKBVEWorldSettlement::FindPlots(Settlement, Road, Seed, Key, Path, Spans, Plots);

			for (const FKBVEWorldPlot& Plot : Plots)
			{
				FKBVEWorldBuildingPlan Sited;
				if (!FKBVEWorldSettlement::Site(Settlement, Road, Shape, Seed, nullptr, Path, Plot,
					Sited))
				{
					continue;
				}

				++Standing;
				Nearest = FMath::Min(Nearest, FVector::Dist2D(Sited.Centre, Made.Spawn));
			}
		}

		TestTrue(TEXT("the spawn chunk raises the houses the plan counted"),
			Standing >= Made.Buildings);

		// Within a plot's reach of a house that stands, which is the difference
		// between starting in the village and starting on the road to it.
		TestTrue(TEXT("the start is at a house the chunk would build"),
			Nearest < Settlement.Setback + Settlement.MaxGap);
	}

	AddInfo(FString::Printf(TEXT("%d of 24 seeds started in a settlement"), InVillage));

	// Every one of them. Villages are sparse but the world is not finite, and the
	// sweep reaches far enough that running out of them is not a thing a seed can
	// do -- so a miss here is the search giving up, not the terrain being unkind.
	TestEqual(TEXT("every seed starts in a settlement"), InVillage, 24);

	return true;
}

#endif
