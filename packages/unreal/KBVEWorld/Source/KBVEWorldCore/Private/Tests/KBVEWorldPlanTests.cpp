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

#endif
