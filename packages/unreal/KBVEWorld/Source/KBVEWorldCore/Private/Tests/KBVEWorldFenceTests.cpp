#include "KBVEWorldFence.h"
#include "KBVEWorldHeightfield.h"
#include "KBVEWorldRoadGraph.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
	/** An edge that actually carries a road, since most pairs do not. */
	bool FindRoutedEdge(const FKBVEWorldRoadParams& Road, const FKBVEWorldHeightfieldParams& Shape,
		int32 Seed, FIntPoint& OutFrom, TArray<FVector>& OutPath,
		TArray<FKBVEWorldRoadSpan>& OutSpans)
	{
		for (int32 X = -8; X <= 8; ++X)
		{
			for (int32 Y = -8; Y <= 8; ++Y)
			{
				const FIntPoint From(X, Y);
				FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, From, From + FIntPoint(1, 0),
					OutPath);
				if (OutPath.Num() >= 2)
				{
					FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, OutPath, OutSpans);
					OutFrom = From;
					return true;
				}
			}
		}
		return false;
	}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldFenceDeterminismTest,
	"KBVE.World.Fence.RunsAreDeterministic",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// A fence is derived and never stored, so both ends of a connection work out
// where one is rather than being told. If the runs were not a pure function of
// (seed, edge, distance), a server and a client would fence different stretches
// of the same road, and a chunk streamed out and back would come home different.
bool FKBVEWorldFenceDeterminismTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldRoadParams Road;
	const FKBVEWorldFenceParams Fence;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	FIntPoint From;
	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;
	if (!TestTrue(TEXT("some edge carries a road"),
		FindRoutedEdge(Road, Shape, Seed, From, Path, Spans)))
	{
		return false;
	}

	TArray<FKBVEWorldFenceRun> First;
	TArray<FKBVEWorldFenceRun> Second;
	FKBVEWorldFence::FindRuns(Fence, Road, Seed, From, Path, Spans, First);
	FKBVEWorldFence::FindRuns(Fence, Road, Seed, From, Path, Spans, Second);

	TestEqual(TEXT("same number of runs"), Second.Num(), First.Num());
	for (int32 I = 0; I < First.Num() && I < Second.Num(); ++I)
	{
		TestEqual(FString::Printf(TEXT("run %d starts in the same place"), I),
			Second[I].Begin, First[I].Begin);
		TestEqual(FString::Printf(TEXT("run %d ends in the same place"), I),
			Second[I].End, First[I].End);
		TestTrue(FString::Printf(TEXT("run %d is the same fence"), I),
			Second[I].Style == First[I].Style && Second[I].Side == First[I].Side);
	}

	// A different seed has to give a different world, or the stream is not being
	// mixed in at all -- which is the way this fails silently.
	TArray<FKBVEWorldFenceRun> Elsewhere;
	FKBVEWorldFence::FindRuns(Fence, Road, Seed + 1, From, Path, Spans, Elsewhere);

	bool bDiffers = Elsewhere.Num() != First.Num();
	for (int32 I = 0; !bDiffers && I < First.Num(); ++I)
	{
		bDiffers = !FMath::IsNearlyEqual(Elsewhere[I].Begin, First[I].Begin);
	}
	TestTrue(TEXT("another seed fences the road differently"), bDiffers);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldFenceClearsCrossingsTest,
	"KBVE.World.Fence.RunsClearTheCrossings",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// A crossing carries its own handrails, and the deck is the one stretch of road
// that is not standing on the ground. A run marched over one would put its posts
// through the deck and into the river underneath, which from the bank reads as a
// fence growing out of the water.
bool FKBVEWorldFenceClearsCrossingsTest::RunTest(const FString& Parameters)
{
	FKBVEWorldRoadParams Road;
	FKBVEWorldFenceParams Fence;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	// Fence everything, so the test is about the crossings rather than about
	// whether the coverage roll happened to leave them alone.
	Fence.Coverage = 1.0f;

	int32 Checked = 0;
	int32 Overlaps = 0;

	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;
	TArray<FKBVEWorldFenceRun> Runs;

	for (int32 X = -6; X <= 6; ++X)
	{
		for (int32 Y = -6; Y <= 6; ++Y)
		{
			const FIntPoint From(X, Y);
			FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, From, From + FIntPoint(1, 0), Path);
			if (Path.Num() < 2)
			{
				continue;
			}

			FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, Path, Spans);
			if (Spans.Num() == 0)
			{
				continue;
			}

			TArray<float> Along;
			Along.SetNumUninitialized(Path.Num());
			Along[0] = 0.0f;
			for (int32 I = 1; I < Path.Num(); ++I)
			{
				Along[I] = Along[I - 1] + FVector::Dist2D(Path[I - 1], Path[I]);
			}

			FKBVEWorldFence::FindRuns(Fence, Road, Seed, From, Path, Spans, Runs);
			++Checked;

			for (const FKBVEWorldFenceRun& Run : Runs)
			{
				for (const FKBVEWorldRoadSpan& Span : Spans)
				{
					if (Span.Begin >= Along.Num() || Span.End >= Along.Num())
					{
						continue;
					}
					if (Run.Begin < Along[Span.End] && Run.End > Along[Span.Begin])
					{
						++Overlaps;
					}
				}
			}
		}
	}

	AddInfo(FString::Printf(TEXT("%d edges with a crossing checked"), Checked));
	TestTrue(TEXT("the sweep found edges with crossings on them"), Checked > 0);
	TestEqual(TEXT("no run stands on a crossing"), Overlaps, 0);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldFenceDetailTest,
	"KBVE.World.Fence.DetailOnlyTakesAway",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The cheaper levels have to be subsets, for the same reason the bridge levels
// are: the tier changes under a viewer who is walking, so a level that moved a
// post rather than dropping a rail would make the fence twitch as they approach.
bool FKBVEWorldFenceDetailTest::RunTest(const FString& Parameters)
{
	FKBVEWorldRoadParams Road;
	FKBVEWorldFenceParams Fence;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	Fence.Coverage = 1.0f;

	FIntPoint From;
	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;
	if (!TestTrue(TEXT("some edge carries a road"),
		FindRoutedEdge(Road, Shape, Seed, From, Path, Spans)))
	{
		return false;
	}

	TArray<FKBVEWorldFenceRun> Runs;
	FKBVEWorldFence::FindRuns(Fence, Road, Seed, From, Path, Spans, Runs);
	if (!TestTrue(TEXT("the edge carries a fence"), Runs.Num() > 0))
	{
		return false;
	}

	FKBVEWorldFenceMesh Full;
	FKBVEWorldFenceMesh Framed;
	FKBVEWorldFenceMesh Posts;

	for (const FKBVEWorldFenceRun& Run : Runs)
	{
		FKBVEWorldFence::BuildRun(Fence, Road, Shape, Seed, nullptr, Path, Run,
			EKBVEWorldFenceDetail::Full, Full);
		FKBVEWorldFence::BuildRun(Fence, Road, Shape, Seed, nullptr, Path, Run,
			EKBVEWorldFenceDetail::Framed, Framed);
		FKBVEWorldFence::BuildRun(Fence, Road, Shape, Seed, nullptr, Path, Run,
			EKBVEWorldFenceDetail::Posts, Posts);
	}

	const int32 FullParts = Full.Wood.Num() + Full.Stone.Num();
	const int32 FramedParts = Framed.Wood.Num() + Framed.Stone.Num();
	const int32 PostParts = Posts.Wood.Num() + Posts.Stone.Num();

	AddInfo(FString::Printf(TEXT("%d runs: %d parts full, %d framed, %d posts only"),
		Runs.Num(), FullParts, FramedParts, PostParts));

	TestTrue(TEXT("the full level stands something up"), FullParts > 0);
	TestTrue(TEXT("dropping the infill costs parts"), FramedParts < FullParts);
	TestTrue(TEXT("dropping the rails costs more"), PostParts < FramedParts);

	// The posts are the silhouette, so every level keeps all of them: what comes
	// off is what fills the gaps between, never the line of the fence itself.
	int32 FullPosts = 0;
	for (const FKBVEWorldPart& Part : Full.Wood)
	{
		if (FMath::IsNearlyEqual(Part.Size.X, Part.Size.Y, 1.0f))
		{
			++FullPosts;
		}
	}
	int32 KeptPosts = 0;
	for (const FKBVEWorldPart& Part : Posts.Wood)
	{
		if (FMath::IsNearlyEqual(Part.Size.X, Part.Size.Y, 1.0f))
		{
			++KeptPosts;
		}
	}
	TestEqual(TEXT("every level stands the same posts"), KeptPosts, FullPosts);

	return true;
}

#endif
