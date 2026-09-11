#include "KBVEWorldRoadField.h"

#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
	/**
	 * A stretch of world with roads routed across it, and a box inside it.
	 *
	 * The box is deliberately not the whole routed area: what a look has to
	 * carry is what a patch over the box can read, and proving that means
	 * having corridors outside it that a correct snapshot leaves behind and a
	 * lazy one copies.
	 */
	struct FRouted
	{
		FKBVEWorldRoadParams Road;
		FKBVEWorldHeightfieldParams Shape;
		int32 Seed = 20260911;
		FKBVEWorldRoadField Field;

		FVector2D Min;
		FVector2D Max;

		/** Whether a box with road in it was found at all. */
		bool bFound = false;

		FRouted()
			: Field(Road, Shape, Seed)
		{
			const float ChunkSize = Road.TilesPerChunk * Road.WorldUnitsPerTile;

			// Somewhere with a road in it, rather than wherever the origin
			// happens to be. Roads are sparse -- the chunk at 0,0 has none, and a
			// box with no corridor agrees with the field about everything by
			// having nothing to disagree about.
			for (int32 Y = 0; Y < 6 && !bFound; ++Y)
			{
				for (int32 X = 0; X < 6 && !bFound; ++X)
				{
					const FVector2D At(X * ChunkSize, Y * ChunkSize);
					Field.EnsureCovers(At - FVector2D(ChunkSize * 3.0f, ChunkSize * 3.0f),
						At + FVector2D(ChunkSize * 4.0f, ChunkSize * 4.0f));

					if (Field.LookOver(At, At + FVector2D(ChunkSize, ChunkSize)).Segments.Num() > 0)
					{
						Min = At;
						Max = At + FVector2D(ChunkSize, ChunkSize);
						bFound = true;
					}
				}
			}
		}
	};
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKBVEWorldRoadLookAnswersAsTheFieldDoes,
	"KBVE.World.RoadLook.AnswersExactlyAsTheFieldDoesInsideItsBox",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldRoadLookAnswersAsTheFieldDoes::RunTest(const FString&)
{
	FRouted World;
	if (!World.bFound)
	{
		AddError(TEXT("no chunk in six by six had a road to test against"));
		return false;
	}

	const FKBVEWorldRoadLook Look = World.Field.LookOver(World.Min, World.Max);

	// Exactly, not nearly. The look holds copies of the same corridors read by
	// the same code, so a difference of any size is a corridor that was left
	// out rather than arithmetic drifting.
	int32 Checked = 0;
	int32 Graded = 0;
	const int32 Steps = 48;
	for (int32 Y = 0; Y <= Steps; ++Y)
	{
		for (int32 X = 0; X <= Steps; ++X)
		{
			const float Wx = FMath::Lerp(World.Min.X, World.Max.X, X / static_cast<float>(Steps));
			const float Wy = FMath::Lerp(World.Min.Y, World.Max.Y, Y / static_cast<float>(Steps));

			const float Base = 100.0f + 0.01f * (Wx + Wy);
			const float Mine = Look.Level(Base, Wx, Wy);
			const float Theirs = World.Field.Level(Base, Wx, Wy);
			if (Mine != Theirs)
			{
				AddError(FString::Printf(TEXT("levelled %.4f where the field says %.4f at %.0f,%.0f"),
					Mine, Theirs, Wx, Wy));
				return false;
			}

			if (Look.SurfaceWeight(Wx, Wy) != World.Field.SurfaceWeight(Wx, Wy))
			{
				AddError(FString::Printf(TEXT("surface differs at %.0f,%.0f"), Wx, Wy));
				return false;
			}

			Graded += Theirs != Base ? 1 : 0;
			++Checked;
		}
	}

	// A snapshot of a box with no road in it agrees with the field trivially,
	// which would let every one of these pass while carrying nothing at all.
	TestTrue(TEXT("the box has road in it to disagree about"), Graded > 0);
	TestEqual(TEXT("every sample was checked"), Checked, (Steps + 1) * (Steps + 1));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKBVEWorldRoadLookLeavesTheRestBehind,
	"KBVE.World.RoadLook.CarriesWhatTheBoxReadsAndNotTheWorld",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldRoadLookLeavesTheRestBehind::RunTest(const FString&)
{
	FRouted World;
	if (!World.bFound)
	{
		AddError(TEXT("no chunk in six by six had a road to test against"));
		return false;
	}

	const FKBVEWorldRoadLook Near = World.Field.LookOver(World.Min, World.Max);

	const float ChunkSize = World.Road.TilesPerChunk * World.Road.WorldUnitsPerTile;
	const FKBVEWorldRoadLook Wide = World.Field.LookOver(
		World.Min - FVector2D(ChunkSize * 3.0f, ChunkSize * 3.0f),
		World.Max + FVector2D(ChunkSize * 3.0f, ChunkSize * 3.0f));

	// The point of the snapshot: what a patch carries is set by what is near it,
	// not by how far the world has been explored. A look that grew with the
	// routed area would be the copy this was written to avoid.
	TestTrue(TEXT("the near look carries something"), Near.Segments.Num() > 0);
	TestTrue(TEXT("and much less than the whole routed world"),
		Near.Segments.Num() < Wide.Segments.Num());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKBVEWorldRoadLookCarriesTheCentreLines,
	"KBVE.World.RoadLook.CarriesTheCentreLinesItsBoxIsSurfacedFrom",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldRoadLookCarriesTheCentreLines::RunTest(const FString&)
{
	FRouted World;
	if (!World.bFound)
	{
		AddError(TEXT("no chunk in six by six had a road to test against"));
		return false;
	}

	const float ChunkSize = World.Road.TilesPerChunk * World.Road.WorldUnitsPerTile;
	const FIntPoint Coord(FMath::FloorToInt(World.Min.X / ChunkSize),
		FMath::FloorToInt(World.Min.Y / ChunkSize));

	const FKBVEWorldRoadLook Look = World.Field.LookOver(World.Min, World.Max);

	// Every line the field would hand this chunk, the look has -- and the same
	// points in the same order, since what is laid along it is a surface whose
	// vertices come from these.
	int32 Held = 0;
	for (int32 S = 0; S < 2; ++S)
	{
		const TArray<FVector>* Theirs = World.Field.FindEdge(Coord, S);
		const TArray<FVector>* Mine = Look.FindEdge(Coord, S);

		if (!Theirs)
		{
			TestNull(TEXT("the look invents no line the field does not have"), Mine);
			continue;
		}

		if (!Mine)
		{
			AddError(FString::Printf(TEXT("edge %d of the box's own chunk was left behind"), S));
			return false;
		}

		TestEqual(TEXT("the line has the same points"), Mine->Num(), Theirs->Num());
		for (int32 I = 0; I < Mine->Num() && I < Theirs->Num(); ++I)
		{
			if (!(*Mine)[I].Equals((*Theirs)[I], 0.0f))
			{
				AddError(FString::Printf(TEXT("point %d of edge %d moved"), I, S));
				return false;
			}
		}
		++Held;
	}

	TestTrue(TEXT("the box's chunk had a centre line to carry"), Held > 0);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKBVEWorldRoadLookOutlivesMoreRouting,
	"KBVE.World.RoadLook.KeepsAnsweringWhileTheFieldRoutesMore",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldRoadLookOutlivesMoreRouting::RunTest(const FString&)
{
	FRouted World;
	if (!World.bFound)
	{
		AddError(TEXT("no chunk in six by six had a road to test against"));
		return false;
	}

	const FKBVEWorldRoadLook Look = World.Field.LookOver(World.Min, World.Max);

	TArray<float> Before;
	const int32 Steps = 24;
	for (int32 Y = 0; Y <= Steps; ++Y)
	{
		for (int32 X = 0; X <= Steps; ++X)
		{
			const float Wx = FMath::Lerp(World.Min.X, World.Max.X, X / static_cast<float>(Steps));
			const float Wy = FMath::Lerp(World.Min.Y, World.Max.Y, Y / static_cast<float>(Steps));
			Before.Add(Look.Level(500.0f, Wx, Wy));
		}
	}

	// The whole reason for the value: the field grows underneath a look that
	// has already been handed out, and the look does not notice. Routing far
	// away is what a viewer walking does on the thread that owns the field,
	// while a patch built from this one is still being generated elsewhere.
	const float ChunkSize = World.Road.TilesPerChunk * World.Road.WorldUnitsPerTile;
	World.Field.EnsureCovers(World.Min + FVector2D(ChunkSize * 8.0f, ChunkSize * 8.0f),
		World.Max + FVector2D(ChunkSize * 12.0f, ChunkSize * 12.0f));

	int32 At = 0;
	for (int32 Y = 0; Y <= Steps; ++Y)
	{
		for (int32 X = 0; X <= Steps; ++X)
		{
			const float Wx = FMath::Lerp(World.Min.X, World.Max.X, X / static_cast<float>(Steps));
			const float Wy = FMath::Lerp(World.Min.Y, World.Max.Y, Y / static_cast<float>(Steps));
			if (Look.Level(500.0f, Wx, Wy) != Before[At++])
			{
				AddError(FString::Printf(TEXT("the look moved at %.0f,%.0f when the field grew"),
					Wx, Wy));
				return false;
			}
		}
	}

	return true;
}

#endif
