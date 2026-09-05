#include "KBVEWorldBridge.h"
#include "KBVEWorldHeightfield.h"
#include "KBVEWorldRibbon.h"
#include "KBVEWorldRoadGraph.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldRoadDeterminismTest,
	"KBVE.World.Road.EdgesAreDeterministic",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The network has no storage and no replication: both ends of a connection
// derive it. If routing were not bit-stable in (seed, A, B), the server and the
// client would put the same road in two places, and a chunk rebuilt after being
// streamed out would not line up with the neighbour that was never released.
bool FKBVEWorldRoadDeterminismTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldRoadParams Road;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	// Not every pair is joined any more, and a joined pair is not necessarily
	// routed: an edge into open water, or one needing a span longer than a bridge
	// would be built at, is dropped after the route is solved. So the pair under
	// test has to be one that came back with a road on it -- asking HasEdge alone
	// picks pairs that route to nothing and asserts about pruning, not routing.
	TArray<FVector> First;
	TArray<FVector> Second;
	FIntPoint From(0, 0);
	FIntPoint To(1, 0);

	for (int32 X = 0; X <= 8 && First.Num() < 2; ++X)
	{
		for (int32 Y = 0; Y <= 8 && First.Num() < 2; ++Y)
		{
			From = FIntPoint(X, Y);
			To = FIntPoint(X + 1, Y);
			FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, From, To, First);
		}
	}

	if (!TestTrue(TEXT("some pair is joined by a road"), First.Num() >= 2))
	{
		return false;
	}

	FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, From, To, Second);

	TestEqual(TEXT("same sample count"), Second.Num(), First.Num());
	for (int32 I = 0; I < First.Num(); ++I)
	{
		TestTrue(FString::Printf(TEXT("sample %d is identical"), I), First[I].Equals(Second[I], 0.0f));
	}

	// Every edge meeting at a node has to arrive at the node itself, or the
	// network is a field of one-chunk stubs.
	const FVector2D Head = FKBVEWorldRoadGraph::NodeTile(Road, Shape, Seed, From);
	const FVector2D Tail = FKBVEWorldRoadGraph::NodeTile(Road, Shape, Seed, To);
	TestTrue(TEXT("starts on its own node"),
		FMath::IsNearlyEqual(First[0].X / Road.WorldUnitsPerTile, Head.X, 0.01f) &&
		FMath::IsNearlyEqual(First[0].Y / Road.WorldUnitsPerTile, Head.Y, 0.01f));
	TestTrue(TEXT("ends on the neighbour's node"),
		FMath::IsNearlyEqual(First.Last().X / Road.WorldUnitsPerTile, Tail.X, 0.01f) &&
		FMath::IsNearlyEqual(First.Last().Y / Road.WorldUnitsPerTile, Tail.Y, 0.01f));

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldRoadAvoidsRiversTest,
	"KBVE.World.Road.RoutingAvoidsRivers",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The river penalty is what turns crossings from scattered into sited. Without
// it a route wanders down the channel it should be stepping over, and the
// bridges that follow are long, diagonal, and everywhere.
bool FKBVEWorldRoadAvoidsRiversTest::RunTest(const FString& Parameters)
{
	FKBVEWorldRoadParams Road;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	// Pruning off in both arms. It drops the edges that cross the most water,
	// which is most of what this test is trying to count -- with it on, both
	// configurations came back with the same handful of wet samples and the
	// comparison was measuring the caps rather than the penalty.
	Road.MaxBridgedFraction = 1.0f;
	Road.MaxBridgeSpanTiles = 100000.0f;

	auto WetSamples = [&](const FKBVEWorldRoadParams& P)
	{
		int32 Wet = 0;
		TArray<FVector> Path;
		for (int32 X = -6; X <= 6; ++X)
		{
			for (int32 Y = -6; Y <= 6; ++Y)
			{
				FKBVEWorldRoadGraph::RouteEdge(P, Shape, Seed, FIntPoint(X, Y), FIntPoint(X + 1, Y), Path);
				for (const FVector& Point : Path)
				{
					if (FKBVEWorldHeightfield::RiverMaskAt(Shape, Seed,
						Point.X / P.WorldUnitsPerTile, Point.Y / P.WorldUnitsPerTile) > 0.5f)
					{
						++Wet;
					}
				}
			}
		}
		return Wet;
	};

	const int32 Avoided = WetSamples(Road);
	Road.RiverWeight = 0.0f;
	const int32 Ignored = WetSamples(Road);


	TestTrue(FString::Printf(TEXT("penalty cuts wet samples (%d penalised vs %d ignored)"),
		Avoided, Ignored), Avoided < Ignored);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldBridgeGeometryTest,
	"KBVE.World.Road.BridgeSpansItsCrossing",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// A deck that ends short of dry ground is a hole in the road, and one whose
// underside is below the water it crosses is a dam. Both are cheap to assert and
// neither is obvious from a screenshot taken from the bank.
bool FKBVEWorldBridgeGeometryTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldRoadParams Road;
	const FKBVEWorldBridgeParams Bridge;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;
	int32 Crossings = 0;

	for (int32 X = -12; X <= 12 && Crossings == 0; ++X)
	{
		for (int32 Y = -12; Y <= 12 && Crossings == 0; ++Y)
		{
			FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, FIntPoint(X, Y), FIntPoint(X, Y + 1), Path);
			FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, Path, Spans);
			Crossings = Spans.Num();
		}
	}

	if (!TestTrue(TEXT("the network crosses its rivers somewhere"), Crossings > 0))
	{
		return false;
	}

	FKBVEWorldBridgeMesh Built;
	FKBVEWorldBridge::Build(Bridge, FKBVEWorldBridgeLod(), Road, Shape, Seed, nullptr, Path,
		Spans[0], Built);
	const FKBVEWorldRibbonMesh& Wood = Built.Wood;
	const FKBVEWorldRibbonMesh& Stone = Built.Stone;

	TestFalse(TEXT("the deck has geometry"), Wood.IsEmpty());
	TestFalse(TEXT("the supports have geometry"), Stone.IsEmpty());
	TestEqual(TEXT("every deck vertex is described"), Wood.Normals.Num(), Wood.Vertices.Num());
	TestEqual(TEXT("every deck vertex is mapped"), Wood.UV0.Num(), Wood.Vertices.Num());

	// The ends land on the ground the road was already on, so the join is flush.
	for (const int32 Index : { Spans[0].Begin, Spans[0].End })
	{
		const FVector& Anchor = Path[Index];
		const float Mask = FKBVEWorldHeightfield::RiverMaskAt(Shape, Seed,
			Anchor.X / Road.WorldUnitsPerTile, Anchor.Y / Road.WorldUnitsPerTile);
		TestTrue(FString::Printf(TEXT("abutment at sample %d is out of the channel (mask %f)"),
			Index, Mask), Mask <= Road.BridgeMaskThreshold);
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldBridgeLodTest,
	"KBVE.World.Road.BridgeFarLodIsASubset",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The far level drops the frame and the curve refinement, and the whole of that
// being safe is that it takes geometry away without moving any. A level that
// shifted the deck would pop when the ring changed, and one that moved a support
// would leave the near level's pier standing somewhere the far level's is not.
bool FKBVEWorldBridgeLodTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldRoadParams Road;
	const FKBVEWorldBridgeParams Bridge;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;
	int32 Crossings = 0;

	for (int32 X = -12; X <= 12 && Crossings == 0; ++X)
	{
		for (int32 Y = -12; Y <= 12 && Crossings == 0; ++Y)
		{
			FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, FIntPoint(X, Y), FIntPoint(X, Y + 1), Path);
			FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, Path, Spans);
			Crossings = Spans.Num();
		}
	}

	if (!TestTrue(TEXT("the network crosses its rivers somewhere"), Crossings > 0))
	{
		return false;
	}

	FKBVEWorldBridgeLod Far;
	Far.CurveSubdivisions = 1;
	Far.bFrame = false;

	FKBVEWorldBridgeMesh NearBuilt;
	FKBVEWorldBridge::Build(Bridge, FKBVEWorldBridgeLod(), Road, Shape, Seed, nullptr, Path,
		Spans[0], NearBuilt);

	FKBVEWorldBridgeMesh FarBuilt;
	FKBVEWorldBridge::Build(Bridge, Far, Road, Shape, Seed, nullptr, Path, Spans[0], FarBuilt);

	const FKBVEWorldRibbonMesh& NearWood = NearBuilt.Wood;
	const FKBVEWorldRibbonMesh& NearStone = NearBuilt.Stone;
	const FKBVEWorldRibbonMesh& FarWood = FarBuilt.Wood;
	const TArray<FBox>& NearBlocks = NearBuilt.Blocks;
	const TArray<FBox>& FarBlocks = FarBuilt.Blocks;

	TestFalse(TEXT("the far deck still has geometry"), FarWood.IsEmpty());
	TestTrue(TEXT("the far level is cheaper than the near one"),
		FarWood.Vertices.Num() < NearWood.Vertices.Num());

	// Instancing the boxes has to be a change of who draws them and not of what
	// is drawn: the same blocks, in the same places, and no stone triangles left
	// in the chunk for the instances to sit inside.
	FKBVEWorldBridgeLod Instanced;
	Instanced.bInstancedParts = true;

	FKBVEWorldBridgeMesh InstancedBuilt;
	FKBVEWorldBridge::Build(Bridge, Instanced, Road, Shape, Seed, nullptr, Path, Spans[0],
		InstancedBuilt);

	TestTrue(TEXT("instancing draws no stone into the chunk"), InstancedBuilt.Stone.IsEmpty());
	TestEqual(TEXT("instancing stands the same supports"),
		InstancedBuilt.StoneParts.Num(), NearBlocks.Num());
	TestEqual(TEXT("instancing still reports the blocks to collide as"),
		InstancedBuilt.Blocks.Num(), NearBlocks.Num());
	TestTrue(TEXT("instancing hangs the cross beams it dropped"),
		InstancedBuilt.WoodParts.Num() > 0);
	TestTrue(TEXT("instancing leaves the deck and its rails alone"),
		InstancedBuilt.Wood.Vertices.Num() < NearWood.Vertices.Num());

	for (int32 I = 0; I < InstancedBuilt.StoneParts.Num() && I < NearBlocks.Num(); ++I)
	{
		TestTrue(FString::Printf(TEXT("instanced support %d is the same box"), I),
			InstancedBuilt.StoneParts[I].Centre.Equals(NearBlocks[I].GetCenter(), 1.0f)
				&& InstancedBuilt.StoneParts[I].Size.Equals(NearBlocks[I].GetSize(), 1.0f));
	}

	AddInfo(FString::Printf(
		TEXT("near: %d wood tris, %d stone tris in %d blocks (stone is %.1f%% of the crossing)"),
		NearWood.Triangles.Num() / 3, NearStone.Triangles.Num() / 3, NearBlocks.Num(),
		100.0f * NearStone.Triangles.Num()
			/ FMath::Max(NearWood.Triangles.Num() + NearStone.Triangles.Num(), 1)));
	AddInfo(FString::Printf(TEXT("far: %d wood tris, %d stone tris (%.0f%% of near's wood)"),
		FarWood.Triangles.Num() / 3, FarBuilt.Stone.Triangles.Num() / 3,
		100.0f * FarWood.Triangles.Num() / FMath::Max(NearWood.Triangles.Num(), 1)));

	// Supports are placed off the frame's reach, which is solved at both levels,
	// so the two have to agree on where every block stands.
	if (TestEqual(TEXT("both levels stand the same supports"), FarBlocks.Num(), NearBlocks.Num()))
	{
		for (int32 I = 0; I < NearBlocks.Num(); ++I)
		{
			TestTrue(FString::Printf(TEXT("support %d stands in the same place"), I),
				NearBlocks[I].Min.Equals(FarBlocks[I].Min, 1.0f));
		}
	}

	return true;
}

#endif
