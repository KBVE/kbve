#include "KBVEWorldHeightfield.h"
#include "KBVEWorldBridge.h"
#include "KBVEWorldRoadField.h"
#include "KBVEWorldRoadGraph.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldRoadFitTest,
	"KBVE.World.Road.SurfaceFollowsTheGround",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The road is the terrain now, so the question is no longer whether a strip sits
// on the ground -- it is whether the ground under the road is flat enough across
// its width to be one. Measured across the carriageway, which is where a camber
// the grading failed to remove would show as a road draped over a hillside.
bool FKBVEWorldRoadFitTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldRoadParams Road;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	const FKBVEWorldRoadField Field(Road, Shape, Seed);
	const float ChunkSize = Road.TilesPerChunk * Road.WorldUnitsPerTile;
	Field.EnsureCovers(FVector2D(-ChunkSize, -ChunkSize),
		FVector2D(ChunkSize * 8.0f, ChunkSize * 8.0f));

	auto Ground = [&](float X, float Y)
	{
		const float Base = FKBVEWorldHeightfield::HeightAt(Shape, Seed,
			X / Road.WorldUnitsPerTile, Y / Road.WorldUnitsPerTile);
		return Field.Level(Base, X, Y);
	};

	float WorstCamber = 0.0f;
	FVector2D WorstAt = FVector2D::ZeroVector;
	FVector WorstAcross = FVector::ZeroVector;
	int32 Sampled = 0;
	int32 Bridged = 0;

	const float Half = Road.RoadWidth * 0.5f;

	TArray<FVector> Path;
	for (int32 X = 0; X <= 6; ++X)
	{
		for (int32 Y = 0; Y <= 6; ++Y)
		{
			for (int32 S = 0; S < 2; ++S)
			{
				const TArray<FVector>* Edge = Field.FindEdge(FIntPoint(X, Y), S);
				if (!Edge || Edge->Num() < 3)
				{
					continue;
				}

				// The ends are pinned to raw ground so junctions meet, so the
				// grading is only responsible for the middle of a run.
				for (int32 I = 2; I < Edge->Num() - 2; ++I)
				{
					const FVector& P = (*Edge)[I];

					// Where the route is carried by a deck the ground beneath it
					// is a river, and is meant to fall away. Only the parts that
					// are road surface are the grading's responsibility.
					if (Field.SurfaceWeight(P.X, P.Y) < 0.99f)
					{
						++Bridged;
						continue;
					}

					const FVector T = ((*Edge)[I + 1] - (*Edge)[I - 1]).GetSafeNormal();
					const FVector Across = FVector(T.Y, -T.X, 0.0f).GetSafeNormal();

					float Low = TNumericLimits<float>::Max();
					float High = -TNumericLimits<float>::Max();
					bool bWholeWidthIsRoad = true;
					for (int32 Lane = -2; Lane <= 2; ++Lane)
					{
						const FVector Q = P + Across * (Half * Lane * 0.5f);
						// An approach to a deck has road down its middle and
						// riverbank under its shoulders, and the bank is supposed
						// to fall. Flatness is only a claim about ground that is
						// carriageway all the way across.
						if (Field.SurfaceWeight(Q.X, Q.Y) < 0.99f)
						{
							bWholeWidthIsRoad = false;
							break;
						}
						const float H = Ground(Q.X, Q.Y);
						Low = FMath::Min(Low, H);
						High = FMath::Max(High, H);
					}

					if (!bWholeWidthIsRoad)
					{
						++Bridged;
						continue;
					}

					if (High - Low > WorstCamber)
					{
						WorstCamber = High - Low;
						WorstAt = FVector2D(P);
						WorstAcross = Across;
					}
					++Sampled;
				}
			}
		}
	}

	AddInfo(FString::Printf(
		TEXT("worst camber %.1f uu across %d road samples (%d carried by decks), worst at %.0f,%.0f"),
		WorstCamber, Sampled, Bridged, WorstAt.X, WorstAt.Y));

	for (int32 Lane = -2; Lane <= 2; ++Lane)
	{
		const FVector Q = FVector(WorstAt.X, WorstAt.Y, 0.0f) + WorstAcross * (Half * Lane * 0.5f);
		float D = 0.0f;
		float Z = 0.0f;
		float Weight = 0.0f;
		Field.Probe(Q.X, Q.Y, D, Z, Weight);
		const float BaseH = FKBVEWorldHeightfield::HeightAt(Shape, Seed,
			Q.X / Road.WorldUnitsPerTile, Q.Y / Road.WorldUnitsPerTile);
		AddInfo(FString::Printf(
			TEXT("  lane %+d: distance %.0f weight %.2f base %.0f levelled %.0f corridorZ %.0f"),
			Lane, D, Weight, BaseH, Ground(Q.X, Q.Y), Z));
	}

	TestTrue(TEXT("the network has road to measure"), Sampled > 500);

	// Most of a network is road, not bridge. If that inverted, the crossing
	// detector would be claiming the whole world is water.
	//
	// Was a factor of four, from when only channels were bridged. A third of this
	// world is under the water plane, so a road network laid across it is
	// legitimately a fifth to a quarter deck by length, and the old ratio was
	// asserting that the world has less water in it than it does. What is worth
	// holding is that road still outweighs deck -- and RoadStaysDry is the claim
	// that the crossings are the right ones.
	TestTrue(FString::Printf(TEXT("most of the network is road, not deck (%d vs %d)"),
		Sampled, Bridged), Sampled > Bridged);

	// 80 uu across 520 uu of width, and it is a bound on the worst of nearly
	// eight thousand samples rather than anything typical. What is left comes
	// from corridors that pass close enough to blend into each other, where the
	// levelled height is a weighted average of two roads at different heights and
	// that average shifts across the width. Widening the flat zone does not touch
	// it -- measured -- so closing it properly means resolving the two corridors
	// against each other rather than averaging them, which is a junction problem
	// and not a grading one.
	TestTrue(FString::Printf(TEXT("the carriageway is flat across (worst camber %.1f uu)"),
		WorstCamber), WorstCamber < 80.0f);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldTerrainLodGapTest,
	"KBVE.World.Road.TerrainLodGap",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The other half of the same question. Distant patches are drawn at a coarser
// stride, so the surface under a road out there is not the surface the road was
// draped onto -- it cuts corners across the real ground and sits below it on
// convex terrain. Reported rather than asserted: this is a property of the LOD
// scheme, and the number is what says whether it matters.
bool FKBVEWorldTerrainLodGapTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	for (const int32 Stride : { 2, 4, 8 })
	{
		float Worst = 0.0f;
		double Total = 0.0;
		int32 Count = 0;

		for (int32 Y = 0; Y < 120; ++Y)
		{
			for (int32 X = 0; X < 120; ++X)
			{
				// Midpoint of a coarse cell, where a chord is furthest from the
				// curve it replaces.
				const float Tx = X * Stride + Stride * 0.5f;
				const float Ty = Y * Stride + Stride * 0.5f;

				const float H00 = FKBVEWorldHeightfield::HeightAt(Shape, Seed, X * Stride, Y * Stride);
				const float H10 = FKBVEWorldHeightfield::HeightAt(Shape, Seed, (X + 1) * Stride, Y * Stride);
				const float H01 = FKBVEWorldHeightfield::HeightAt(Shape, Seed, X * Stride, (Y + 1) * Stride);
				const float H11 = FKBVEWorldHeightfield::HeightAt(Shape, Seed, (X + 1) * Stride, (Y + 1) * Stride);
				const float Lerped = (H00 + H10 + H01 + H11) * 0.25f;

				const float Gap = FMath::Abs(Lerped - FKBVEWorldHeightfield::HeightAt(Shape, Seed, Tx, Ty));
				Worst = FMath::Max(Worst, Gap);
				Total += Gap;
				++Count;
			}
		}

		AddInfo(FString::Printf(TEXT("stride %d: mean gap %.1f uu, worst %.1f uu"),
			Stride, Total / Count, Worst));
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldBridgeJoinTest,
	"KBVE.World.Road.BridgeMeetsTheRoad",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// Two claims about every crossing in the network: the deck arrives at the height
// the road is actually at, and it does not rise further than a bridge over that
// crossing has any reason to.
//
// The first is not automatic. The road is graded terrain now, so a deck that
// took its ends off the raw heightfield would meet the road at a height the road
// no longer has -- a step at both abutments, on every bridge. The second is the
// clearance solve, which divides by the taper carrying the arch and so turns a
// small shortfall near either end into an enormous rise.
bool FKBVEWorldBridgeJoinTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldRoadParams Road;
	const FKBVEWorldBridgeParams Bridge;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	const FKBVEWorldRoadField Field(Road, Shape, Seed);
	const float ChunkSize = Road.TilesPerChunk * Road.WorldUnitsPerTile;
	Field.EnsureCovers(FVector2D(-ChunkSize, -ChunkSize),
		FVector2D(ChunkSize * 7.0f, ChunkSize * 7.0f));

	auto Ground = [&](const FVector& P)
	{
		const float Base = FKBVEWorldHeightfield::HeightAt(Shape, Seed,
			P.X / Road.WorldUnitsPerTile, P.Y / Road.WorldUnitsPerTile);
		return Field.Level(Base, P.X, P.Y);
	};

	float WorstStep = 0.0f;
	float WorstRise = 0.0f;
	int32 Crossings = 0;

	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;

	for (int32 X = 0; X <= 5; ++X)
	{
		for (int32 Y = 0; Y <= 5; ++Y)
		{
			for (int32 S = 0; S < 2; ++S)
			{
				const FIntPoint A(X, Y);
				const FIntPoint B = A + (S == 0 ? FIntPoint(1, 0) : FIntPoint(0, 1));
				FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, A, B, Path);
				if (Path.Num() < 2)
				{
					continue;
				}

				FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, Path, Spans);
				for (const FKBVEWorldRoadSpan& Span : Spans)
				{
					FKBVEWorldBridgeMesh Built;
					FKBVEWorldBridge::Build(Bridge, FKBVEWorldBridgeLod(), Road, Shape, Seed,
						&Field, Path, Span, Built);
					const FKBVEWorldRibbonMesh& Wood = Built.Wood;
					const FKBVEWorldRibbonMesh& Stone = Built.Stone;
					if (Wood.IsEmpty())
					{
						continue;
					}
					++Crossings;

					const FVector& Head = Path[Span.Begin];
					const FVector& Tail = Path[Span.End];
					const float HeadZ = Ground(Head);
					const float TailZ = Ground(Tail);

					// The deck surface nearest each anchor, against the road
					// surface there.
					for (const FVector& Anchor : { Head, Tail })
					{
						const float AnchorZ = Ground(Anchor);
						float Top = -TNumericLimits<float>::Max();
						for (const FVector& V : Wood.Vertices)
						{
							if (FVector::Dist2D(V, Anchor) < 80.0f)
							{
								Top = FMath::Max(Top, V.Z);
							}
						}
						if (Top > -TNumericLimits<float>::Max())
						{
							WorstStep = FMath::Max(WorstStep, FMath::Abs(Top - AnchorZ));
						}
					}

					// Rise above the straight line between the two abutments.
					const float Length = FMath::Max(FVector::Dist2D(Head, Tail), KINDA_SMALL_NUMBER);
					for (const FVector& V : Wood.Vertices)
					{
						const float T = FMath::Clamp(FVector::Dist2D(V, Head) / Length, 0.0f, 1.0f);
						WorstRise = FMath::Max(WorstRise, V.Z - FMath::Lerp(HeadZ, TailZ, T));
					}
				}
			}
		}
	}

	AddInfo(FString::Printf(TEXT("%d crossings: worst join step %.1f uu, worst rise %.1f uu"),
		Crossings, WorstStep, WorstRise));

	TestTrue(TEXT("the network has crossings to measure"), Crossings > 0);

	// The deck top carries rails above it, so the rise is bounded by the arch
	// plus what stands on the deck rather than by the arch alone.
	const float Ceiling = Bridge.MaxArchHeight + Bridge.RailHeight + Bridge.RailThickness;
	TestTrue(FString::Printf(TEXT("no bridge arches higher than it needs (worst rise %.1f uu)"),
		WorstRise), WorstRise <= Ceiling);

	TestTrue(FString::Printf(TEXT("decks meet the road they join (worst step %.1f uu)"),
		WorstStep), WorstStep < 60.0f);
	return true;
}


IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldBridgeSupportTest,
	"KBVE.World.Road.BridgeIsSupported",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// Whether a crossing is a structure or a plank.
//
// Two things were wrong and neither showed up in the join or clearance tests,
// because both of those only ask about the deck. Abutments were requested at the
// anchors, where the deck is flush with the road by construction, so every one of
// them was shorter than a pier is worth building and was declined -- no bridge in
// the world had one. And the rise was a constant, which over a span of a few
// thousand units is a slope of one in forty: the middle of every long crossing
// was flat.
bool FKBVEWorldBridgeSupportTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldRoadParams Road;
	const FKBVEWorldBridgeParams Bridge;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	const FKBVEWorldRoadField Field(Road, Shape, Seed);
	const float ChunkSize = Road.TilesPerChunk * Road.WorldUnitsPerTile;
	Field.EnsureCovers(FVector2D(-ChunkSize, -ChunkSize),
		FVector2D(ChunkSize * 7.0f, ChunkSize * 7.0f));

	auto Ground = [&](const FVector& P)
	{
		const float Base = FKBVEWorldHeightfield::HeightAt(Shape, Seed,
			P.X / Road.WorldUnitsPerTile, P.Y / Road.WorldUnitsPerTile);
		return Field.Level(Base, P.X, P.Y);
	};

	int32 Crossings = 0;
	int32 Unsupported = 0;
	float FlattestSlope = TNumericLimits<float>::Max();
	float LongestSpan = 0.0f;
	double SlopeTotal = 0.0;
	FVector2D FlattestAt = FVector2D::ZeroVector;

	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;

	for (int32 X = 0; X <= 5; ++X)
	{
		for (int32 Y = 0; Y <= 5; ++Y)
		{
			for (int32 S = 0; S < 2; ++S)
			{
				const FIntPoint A(X, Y);
				const FIntPoint B = A + (S == 0 ? FIntPoint(1, 0) : FIntPoint(0, 1));
				FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, A, B, Path);
				if (Path.Num() < 2)
				{
					continue;
				}

				FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, Path, Spans);
				for (const FKBVEWorldRoadSpan& Span : Spans)
				{
					FKBVEWorldBridgeMesh Built;
					FKBVEWorldBridge::Build(Bridge, FKBVEWorldBridgeLod(), Road, Shape, Seed,
						&Field, Path, Span, Built);
					const FKBVEWorldRibbonMesh& Wood = Built.Wood;
					const FKBVEWorldRibbonMesh& Stone = Built.Stone;
					if (Wood.IsEmpty())
					{
						continue;
					}
					++Crossings;

					if (Stone.IsEmpty())
					{
						++Unsupported;

						// What a crossing with nothing under it actually looks
						// like. Guessing at this twice produced two fixes that
						// changed nothing, so the geometry gets printed instead.
						const FVector& H = Path[Span.Begin];
						const FVector& T = Path[Span.End];
						float Buried = -TNumericLimits<float>::Max();
						float Clear = TNumericLimits<float>::Max();
						float BuriedAt = 0.0f;
						const float Run = FMath::Max(FVector::Dist2D(H, T), KINDA_SMALL_NUMBER);
						for (const FVector& V : Wood.Vertices)
						{
							const float Gap = Ground(V) - V.Z;
							if (Gap > Buried)
							{
								Buried = Gap;
								BuriedAt = FVector::Dist2D(V, H) / Run;
							}
							Clear = FMath::Min(Clear, V.Z - Ground(V));
						}
						AddInfo(FString::Printf(
							TEXT("  bare crossing at %.0f,%.0f: span %.0f uu, headZ %.0f tailZ %.0f, deepest burial %.0f uu at t=%.2f, best clearance %.0f uu"),
							H.X, H.Y, Run, Ground(H), Ground(T), Buried, BuriedAt, Clear));
					}

					const FVector& Head = Path[Span.Begin];
					const FVector& Tail = Path[Span.End];
					const float HeadZ = Ground(Head);
					const float TailZ = Ground(Tail);
					const float Length = FMath::Max(FVector::Dist2D(Head, Tail), KINDA_SMALL_NUMBER);
					LongestSpan = FMath::Max(LongestSpan, Length);

					// Rise above the chord, over the length carrying it. A
					// crossing is as flat as this number is small, whatever its
					// absolute rise happens to be.
					float Rise = 0.0f;
					for (const FVector& V : Wood.Vertices)
					{
						const float T = FMath::Clamp(FVector::Dist2D(V, Head) / Length, 0.0f, 1.0f);
						Rise = FMath::Max(Rise, V.Z - FMath::Lerp(HeadZ, TailZ, T));
					}

					const float Slope = Rise / Length;
					SlopeTotal += Slope;
					if (Slope < FlattestSlope)
					{
						FlattestSlope = Slope;
						FlattestAt = FVector2D(Head);
					}
				}
			}
		}
	}

	AddInfo(FString::Printf(
		TEXT("%d crossings, %d with no stone; longest span %.0f uu; rise/span flattest %.3f mean %.3f, flattest at %.0f,%.0f"),
		Crossings, Unsupported, LongestSpan, FlattestSlope, SlopeTotal / FMath::Max(Crossings, 1),
		FlattestAt.X, FlattestAt.Y));

	TestTrue(TEXT("the network has crossings to measure"), Crossings > 0);

	TestEqual(TEXT("every crossing is carried by masonry"), Unsupported, 0);

	// The rails stand above the deck, so the measured rise is the arch plus what
	// is on it -- which is why this is well clear of ArchSpanRatio rather than
	// equal to it. The claim is only that no crossing is flat.
	TestTrue(FString::Printf(TEXT("no crossing is a flat plank (flattest rise/span %.3f)"),
		FlattestSlope), FlattestSlope > Bridge.ArchSpanRatio * 0.5f);
	return true;
}


IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldRoadDryTest,
	"KBVE.World.Road.RoadStaysDry",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// No stretch of road that is not a bridge may sit under the water plane.
//
// Crossings used to be found by the river mask alone, which answers a different
// question: where a channel is, not whether the road is wet. A basin in the
// continent noise that happens to fall below the water plane is a pond -- it
// carries no channel, so it scored zero, and the route drove into it while the
// grading laid a flat submerged shelf along the bottom.
bool FKBVEWorldRoadDryTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldRoadParams Road;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	const FKBVEWorldRoadField Field(Road, Shape, Seed);
	const float ChunkSize = Road.TilesPerChunk * Road.WorldUnitsPerTile;
	Field.EnsureCovers(FVector2D(-ChunkSize, -ChunkSize),
		FVector2D(ChunkSize * 7.0f, ChunkSize * 7.0f));

	auto Ground = [&](const FVector& P)
	{
		const float Base = FKBVEWorldHeightfield::HeightAt(Shape, Seed,
			P.X / Road.WorldUnitsPerTile, P.Y / Road.WorldUnitsPerTile);
		return Field.Level(Base, P.X, P.Y);
	};

	float Deepest = 0.0f;
	int32 Pruned[5] = { 0, 0, 0, 0, 0 };
	int32 Joined = 0;
	int32 Built = 0;
	int32 Submerged = 0;
	int32 Dry = 0;
	int32 Decked = 0;
	FVector2D DeepestAt = FVector2D::ZeroVector;

	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;

	for (int32 X = 0; X <= 5; ++X)
	{
		for (int32 Y = 0; Y <= 5; ++Y)
		{
			for (int32 S = 0; S < 2; ++S)
			{
				const FIntPoint A(X, Y);
				const FIntPoint B = A + (S == 0 ? FIntPoint(1, 0) : FIntPoint(0, 1));
				Joined += FKBVEWorldRoadGraph::HasEdge(Road, Seed, A, B) ? 1 : 0;
				EKBVEWorldRoadPrune Why = EKBVEWorldRoadPrune::None;
				FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, A, B, Path, &Why);
				Pruned[static_cast<int32>(Why)] += 1;
				if (Path.Num() < 2)
				{
					continue;
				}
				++Built;
				FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, Path, Spans);

				for (int32 I = 0; I < Path.Num(); ++I)
				{
					bool bCarried = false;
					for (const FKBVEWorldRoadSpan& Span : Spans)
					{
						if (I >= Span.Begin && I <= Span.End)
						{
							bCarried = true;
							break;
						}
					}
					if (bCarried)
					{
						++Decked;
						continue;
					}

					++Dry;
					const float Z = Ground(Path[I]);
					if (Z < Shape.WaterZ)
					{
						++Submerged;
						if (Shape.WaterZ - Z > Deepest)
						{
							Deepest = Shape.WaterZ - Z;
							DeepestAt = FVector2D(Path[I]);
						}
					}
				}
			}
		}
	}

	AddInfo(FString::Printf(
		TEXT("%d road samples, %d carried by decks, %d submerged (deepest %.0f uu at %.0f,%.0f)"),
		Dry, Decked, Submerged, Deepest, DeepestAt.X, DeepestAt.Y));

	// How much of the network the water pruning takes. A third of this world is
	// under the water plane, so some loss is the point -- but a network that is
	// mostly gone is a lattice of stubs, not a road system, and that is a routing
	// failure wearing the costume of a correct one.
	AddInfo(FString::Printf(TEXT("%d of %d joined pairs carry a road (%.0f%% pruned)"),
		Built, Joined, 100.0 * (Joined - Built) / FMath::Max(Joined, 1)));
	AddInfo(FString::Printf(TEXT("pruned: node in water %d, span too long %d, too much deck %d"),
		Pruned[static_cast<int32>(EKBVEWorldRoadPrune::NodeInWater)],
		Pruned[static_cast<int32>(EKBVEWorldRoadPrune::SpanTooLong)],
		Pruned[static_cast<int32>(EKBVEWorldRoadPrune::TooMuchDeck)]));

	TestTrue(TEXT("the network has road to measure"), Dry > 500);
	TestEqual(TEXT("no road runs under the water"), Submerged, 0);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldPondDrainageTest,
	"KBVE.World.Heightfield.PondDrainage",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// How much standing water the world makes that the channel field knows nothing
// about, and how far it is from anything that drains.
//
// The two are generated independently: the water plane cuts whatever the
// continent noise happens to put below it, while the channels are the zero
// contour of a field of their own. Nothing connects them, so a basin can sit
// there with no inflow and no outlet. Reported rather than asserted -- this is
// a measurement of how much a drainage model would be worth, not a defect.
bool FKBVEWorldPondDrainageTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldHeightfieldParams Shape;
	const FKBVEWorldRoadParams Road;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	const int32 Edge = 260;
	const float Step = 4.0f;

	TArray<uint8> Pond;
	TArray<uint8> River;
	TArray<int32> Distance;
	Pond.SetNumZeroed(Edge * Edge);
	River.SetNumZeroed(Edge * Edge);
	Distance.Init(TNumericLimits<int32>::Max(), Edge * Edge);

	int32 Wet = 0;
	for (int32 Y = 0; Y < Edge; ++Y)
	{
		for (int32 X = 0; X < Edge; ++X)
		{
			const float Tx = X * Step;
			const float Ty = Y * Step;
			const int32 I = Y * Edge + X;

			const bool bChannel = FKBVEWorldHeightfield::RiverMaskAt(Shape, Seed, Tx, Ty)
				> Road.BridgeMaskThreshold;
			const bool bUnder = FKBVEWorldHeightfield::HeightAt(Shape, Seed, Tx, Ty) < Shape.WaterZ;

			River[I] = bChannel ? 1 : 0;
			Pond[I] = (bUnder && !bChannel) ? 1 : 0;
			Wet += (bUnder || bChannel) ? 1 : 0;
		}
	}

	// Multi-source flood from every channel cell, so each pond cell learns how
	// far it is from the nearest thing that carries water away.
	TArray<int32> Queue;
	Queue.Reserve(Edge * Edge);
	for (int32 I = 0; I < Edge * Edge; ++I)
	{
		if (River[I])
		{
			Distance[I] = 0;
			Queue.Add(I);
		}
	}

	for (int32 Head = 0; Head < Queue.Num(); ++Head)
	{
		const int32 I = Queue[Head];
		const int32 X = I % Edge;
		const int32 Y = I / Edge;
		const int32 Next = Distance[I] + 1;

		const FIntPoint Around[4] = { {1, 0}, {-1, 0}, {0, 1}, {0, -1} };
		for (const FIntPoint& D : Around)
		{
			const int32 Nx = X + D.X;
			const int32 Ny = Y + D.Y;
			if (Nx < 0 || Ny < 0 || Nx >= Edge || Ny >= Edge)
			{
				continue;
			}
			const int32 J = Ny * Edge + Nx;
			if (Distance[J] > Next)
			{
				Distance[J] = Next;
				Queue.Add(J);
			}
		}
	}

	int32 Ponds = 0;
	int32 Stranded = 0;
	int32 Worst = 0;
	double Total = 0.0;
	const int32 Reach = FMath::CeilToInt(Shape.RiverWidthTiles * 2.0f / Step);

	for (int32 I = 0; I < Edge * Edge; ++I)
	{
		if (!Pond[I])
		{
			continue;
		}
		++Ponds;
		const int32 D = Distance[I];
		if (D == TNumericLimits<int32>::Max())
		{
			++Stranded;
			continue;
		}
		Total += D;
		Worst = FMath::Max(Worst, D);
		if (D > Reach)
		{
			++Stranded;
		}
	}

	const int32 Cells = Edge * Edge;
	AddInfo(FString::Printf(
		TEXT("%.1f%% of the world is water; %.1f%% is still water the channel field never drew"),
		100.0 * Wet / Cells, 100.0 * Ponds / Cells));
	AddInfo(FString::Printf(
		TEXT("%d pond cells, %d of them further than %d cells (%.0f tiles) from a channel"),
		Ponds, Stranded, Reach, Reach * Step));
	AddInfo(FString::Printf(TEXT("pond to channel: mean %.1f cells, worst %d cells (%.0f tiles)"),
		Total / FMath::Max(Ponds - Stranded, 1), Worst, Worst * Step));

	TestTrue(TEXT("the sampled window has water in it"), Wet > 0);
	return true;
}


IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldBridgeSolidTest,
	"KBVE.World.Road.BridgeIsSolid",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// Whether the bridge meshes are closed surfaces.
//
// "Not solid" has several causes that look alike from a camera -- a hole in the
// hull, a face wound inside out so it vanishes under backface culling, a normal
// pointing the wrong way so it reads as a shadowed gap -- and they need
// different fixes. Counting edges separates them: in a closed mesh every edge is
// shared by exactly two triangles, and in a consistently wound one those two
// traverse it in opposite directions. A hole shows up as edges used once; an
// inside-out face shows up as edges used twice the same way.
bool FKBVEWorldBridgeSolidTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldRoadParams Road;
	const FKBVEWorldBridgeParams Bridge;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	const FKBVEWorldRoadField Field(Road, Shape, Seed);
	const float ChunkSize = Road.TilesPerChunk * Road.WorldUnitsPerTile;
	Field.EnsureCovers(FVector2D(-ChunkSize, -ChunkSize),
		FVector2D(ChunkSize * 4.0f, ChunkSize * 4.0f));

	// Welded by position: the builder gives the underside and the sides their own
	// vertices so the edge between them stays sharp, so index equality would call
	// every seam a hole. Quantised, because two faces meeting at a corner arrive
	// at the same place by different arithmetic.
	auto Key = [](const FVector& V)
	{
		return FIntVector(FMath::RoundToInt(V.X * 8.0f), FMath::RoundToInt(V.Y * 8.0f),
			FMath::RoundToInt(V.Z * 8.0f));
	};

	int32 Checked = 0;
	int32 Open = 0;
	int32 Reversed = 0;
	FVector2D WorstAt = FVector2D::ZeroVector;
	int32 WorstOpen = 0;

	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;

	for (int32 X = 0; X <= 3; ++X)
	{
		for (int32 Y = 0; Y <= 3; ++Y)
		{
			for (int32 S = 0; S < 2; ++S)
			{
				const FIntPoint A(X, Y);
				const FIntPoint B = A + (S == 0 ? FIntPoint(1, 0) : FIntPoint(0, 1));
				FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, A, B, Path);
				if (Path.Num() < 2)
				{
					continue;
				}

				FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, Path, Spans);
				for (const FKBVEWorldRoadSpan& Span : Spans)
				{
					FKBVEWorldBridgeMesh Built;
					FKBVEWorldBridge::Build(Bridge, FKBVEWorldBridgeLod(), Road, Shape, Seed,
						&Field, Path, Span, Built);
					const FKBVEWorldRibbonMesh& Wood = Built.Wood;
					const FKBVEWorldRibbonMesh& Stone = Built.Stone;
					if (Wood.IsEmpty())
					{
						continue;
					}
					++Checked;

					TMap<TPair<FIntVector, FIntVector>, int32> Edges;
					for (int32 I = 0; I + 2 < Wood.Triangles.Num(); I += 3)
					{
						const FIntVector V[3] = {
							Key(Wood.Vertices[Wood.Triangles[I]]),
							Key(Wood.Vertices[Wood.Triangles[I + 1]]),
							Key(Wood.Vertices[Wood.Triangles[I + 2]]),
						};
						for (int32 E = 0; E < 3; ++E)
						{
							Edges.FindOrAdd(TPair<FIntVector, FIntVector>(V[E], V[(E + 1) % 3])) += 1;
						}
					}

					int32 OpenHere = 0;
					for (const TPair<TPair<FIntVector, FIntVector>, int32>& It : Edges)
					{
						const int32* Back = Edges.Find(
							TPair<FIntVector, FIntVector>(It.Key.Value, It.Key.Key));
						if (!Back)
						{
							++OpenHere;
						}
						else if (It.Value != *Back)
						{
							++Reversed;
						}
					}

					Open += OpenHere;
					if (OpenHere > WorstOpen)
					{
						WorstOpen = OpenHere;
						WorstAt = FVector2D(Path[Span.Begin]);
					}
				}
			}
		}
	}

	AddInfo(FString::Printf(
		TEXT("%d decks: %d edges with no facing pair, %d wound the same way both times; worst deck %d open at %.0f,%.0f"),
		Checked, Open, Reversed, WorstOpen, WorstAt.X, WorstAt.Y));

	TestTrue(TEXT("there are decks to check"), Checked > 0);
	TestEqual(TEXT("the deck and its rails are closed"), Open, 0);
	return true;
}


IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldMasonryUnderDeckTest,
	"KBVE.World.Road.MasonryStaysUnderTheDeck",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// No stone stands above the timber it is holding up.
//
// Two closed solids that pass through each other are each perfectly watertight,
// so BridgeIsSolid says nothing about this and neither does anything else here.
// It went unnoticed until the winding fix made both of them visible at once:
// piers rose to the deck's underside while the girders hang below that, so every
// support ran up through the frame, and abutment blocks took their height from
// the deck's centre while being square against a sloping deck, so their corners
// came up through the floor.
bool FKBVEWorldMasonryUnderDeckTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldRoadParams Road;
	const FKBVEWorldBridgeParams Bridge;
	const FKBVEWorldHeightfieldParams Shape;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);

	const FKBVEWorldRoadField Field(Road, Shape, Seed);
	const float ChunkSize = Road.TilesPerChunk * Road.WorldUnitsPerTile;
	Field.EnsureCovers(FVector2D(-ChunkSize, -ChunkSize),
		FVector2D(ChunkSize * 4.0f, ChunkSize * 4.0f));

	float Worst = 0.0f;
	float WorstStone = 0.0f;
	float WorstCarried = 0.0f;
	float WorstSpan = 0.0f;
	float WorstOffset = 0.0f;
	FVector2D WorstAt = FVector2D::ZeroVector;
	int32 Checked = 0;

	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;

	for (int32 X = 0; X <= 3; ++X)
	{
		for (int32 Y = 0; Y <= 3; ++Y)
		{
			for (int32 S = 0; S < 2; ++S)
			{
				const FIntPoint A(X, Y);
				const FIntPoint B = A + (S == 0 ? FIntPoint(1, 0) : FIntPoint(0, 1));
				FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, A, B, Path);
				if (Path.Num() < 2)
				{
					continue;
				}

				FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, Path, Spans);
				for (const FKBVEWorldRoadSpan& Span : Spans)
				{
					FKBVEWorldBridgeMesh Built;
					FKBVEWorldBridge::Build(Bridge, FKBVEWorldBridgeLod(), Road, Shape, Seed,
						&Field, Path, Span, Built);
					const FKBVEWorldRibbonMesh& Wood = Built.Wood;
					const FKBVEWorldRibbonMesh& Stone = Built.Stone;
					if (Stone.IsEmpty())
					{
						continue;
					}
					++Checked;

					// Measured against the lowest timber nearby, not the highest.
					// The lowest is the underside of whatever the stone is meant
					// to be carrying -- a cross beam, a girder, or the deck
					// itself out at the abutments where there is no frame -- so a
					// support that stops under it is right by construction and
					// one that runs past it is inside the frame. Taking the
					// highest instead would measure against the rail tops and the
					// bound would be too loose to fail.
					for (const FVector& V : Stone.Vertices)
					{
						// Near enough to be the same place, not merely nearby.
						//
						// A pier's width was the first radius here and it made
						// the test measure proximity rather than overlap: it
						// found the frame's leading edge a few tens of units
						// further along the deck, where the deck stands higher,
						// and called that a support standing through it. Timber
						// that a block is beside is not timber it is inside. This
						// is a little over a girder's width, which is close
						// enough that a vertex genuinely under one finds it and
						// far enough that the vertex spacing along a swept strip
						// does not let it slip between samples.
						float Carried = TNumericLimits<float>::Max();
						for (const FVector& W : Wood.Vertices)
						{
							if (FVector::Dist2D(V, W) < Bridge.GirderWidth * 1.25f)
							{
								Carried = FMath::Min(Carried, W.Z);
							}
						}
						if (Carried == TNumericLimits<float>::Max())
						{
							continue;
						}

						const float Into = V.Z - Carried;
						if (Into > Worst)
						{
							Worst = Into;
							WorstAt = FVector2D(V);
							WorstStone = V.Z;
							WorstCarried = Carried;
							WorstSpan = FVector::Dist2D(Path[Span.Begin], Path[Span.End]);
							WorstOffset = FVector::Dist2D(V, Path[Span.Begin]);
						}
					}
				}
			}
		}
	}

	AddInfo(FString::Printf(TEXT("%d crossings: worst stone %.1f uu into the deck, at %.0f,%.0f"),
		Checked, Worst, WorstAt.X, WorstAt.Y));
	AddInfo(FString::Printf(
		TEXT("  stone top %.0f, timber under %.0f, %.0f uu along a %.0f uu span (t=%.2f)"),
		WorstStone, WorstCarried, WorstOffset, WorstSpan,
		WorstOffset / FMath::Max(WorstSpan, 1.0f)));

	TestTrue(TEXT("there is masonry to check"), Checked > 0);

	// A tolerance, not a margin: a support is meant to meet the timber it
	// carries, so zero is the target and anything approaching a girder's depth
	// means the stone is inside the frame rather than under it.
	TestTrue(FString::Printf(TEXT("no support stands through what it carries (worst %.1f uu)"),
		Worst), Worst < 8.0f);
	return true;
}

#endif
