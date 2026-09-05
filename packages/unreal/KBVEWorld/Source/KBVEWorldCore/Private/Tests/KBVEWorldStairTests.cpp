#include "KBVEWorldStair.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldStairRiserTest,
	"KBVE.World.Stair.EveryStepIsTheSameAndClimbable",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The whole point of the flight. A stair whose steps are not all the same height
// is one a character controller catches on partway up, and the failure looks
// like the door being unreachable rather than like a mesh being wrong -- so it
// is checked as arithmetic here instead of being found by walking into it.
bool FKBVEWorldStairRiserTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldStairParams Stair;

	TestEqual(TEXT("level ground needs no steps"), FKBVEWorldStair::Count(Stair, 0.0f), 0);
	TestEqual(TEXT("a drop of nothing needs no steps"), FKBVEWorldStair::Count(Stair, -50.0f), 0);

	for (float Rise = 4.0f; Rise <= 320.0f; Rise += 4.0f)
	{
		const int32 Steps = FKBVEWorldStair::Count(Stair, Rise);
		if (!TestTrue(TEXT("any rise at all takes a step"), Steps > 0))
		{
			return false;
		}

		const float Riser = Rise / static_cast<float>(Steps);

		// The rise is divided rather than stepped off, so the last step is the
		// same as the first. Stepping off MaxRiser until the rise ran out would
		// leave the remainder in whichever step happened to be last.
		if (Steps < Stair.MaxSteps)
		{
			TestTrue(FString::Printf(TEXT("a rise of %.0f is climbable in %d"), Rise, Steps),
				Riser <= Stair.MaxRiser + KINDA_SMALL_NUMBER);
		}

		// And no more steps than the rise needs, or a doorstep becomes a staircase.
		TestTrue(FString::Printf(TEXT("a rise of %.0f is not over-divided"), Rise),
			Steps == 1 || Riser > 0.5f * Stair.MaxRiser);
	}

	// A drop nothing sane produced still has to cost a bounded number of boxes.
	TestEqual(TEXT("an absurd rise is capped"), FKBVEWorldStair::Count(Stair, 100000.0f),
		Stair.MaxSteps);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldStairGeometryTest,
	"KBVE.World.Stair.ReachesTheThresholdAndTheGround",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// Both ends of the flight, which are the two ways it can be built and still not
// work: a top tread below the threshold is a step into the doorway, and a bottom
// step above the ground is a flight floating over a hole.
bool FKBVEWorldStairGeometryTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldStairParams Stair;

	FKBVEWorldStairBuild In;
	In.Origin = FVector(100.0f, -250.0f, 1200.0f);
	In.Out = FVector(1.0f, 0.0f, 0.0f);
	In.Right = FVector(0.0f, 1.0f, 0.0f);
	In.Width = 116.0f;
	In.Rise = 143.0f;

	FKBVEWorldRibbonMesh Mesh;
	FKBVEWorldStair::Build(Stair, In, Mesh);

	if (!TestTrue(TEXT("the flight was built"), Mesh.Triangles.Num() > 0))
	{
		return false;
	}

	float Highest = -BIG_NUMBER;
	float Lowest = BIG_NUMBER;
	float Furthest = -BIG_NUMBER;
	float Widest = 0.0f;
	for (const FVector& Vertex : Mesh.Vertices)
	{
		Highest = FMath::Max(Highest, Vertex.Z);
		Lowest = FMath::Min(Lowest, Vertex.Z);
		Furthest = FMath::Max(Furthest, Vertex.X - In.Origin.X);
		Widest = FMath::Max(Widest, FMath::Abs(Vertex.Y - In.Origin.Y));
	}

	TestTrue(TEXT("the top tread is level with the threshold"),
		FMath::IsNearlyEqual(Highest, In.Origin.Z, 0.01f));
	TestTrue(TEXT("the bottom step reaches the ground the rise was measured to"),
		FMath::IsNearlyEqual(Lowest, In.Origin.Z - In.Rise, 0.01f));
	TestTrue(TEXT("the flight runs out no further than it said it would"),
		Furthest <= FKBVEWorldStair::Run(Stair, In.Rise) + 0.01f);

	// Wider than the doorway, because a flight exactly as wide as its door is one
	// you can walk off the side of on the way in.
	TestTrue(TEXT("the flight is wider than the opening"), Widest > 0.5f * In.Width);

	// Nothing at all where there is nothing to climb, rather than a slab.
	FKBVEWorldRibbonMesh Flat;
	FKBVEWorldStairBuild Level = In;
	Level.Rise = 0.0f;
	FKBVEWorldStair::Build(Stair, Level, Flat);
	TestTrue(TEXT("level ground gets no flight"), Flat.IsEmpty());

	return true;
}

#endif
