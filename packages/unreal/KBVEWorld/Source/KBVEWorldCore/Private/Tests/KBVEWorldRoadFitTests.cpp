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
	// detector would be claiming the whole world is river.
	TestTrue(FString::Printf(TEXT("most of the network is road, not deck (%d vs %d)"),
		Sampled, Bridged), Sampled > Bridged * 4);

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
					FKBVEWorldRibbonMesh Wood;
					FKBVEWorldRibbonMesh Stone;
					FKBVEWorldBridge::Build(Bridge, Road, Shape, Seed, &Field, Path, Span,
						Wood, Stone);
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

#endif
