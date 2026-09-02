#include "KBVEWorldHeightfield.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldHeightfieldVectorsTest,
	"KBVE.World.Heightfield.CrossLanguageVectors",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// Pinned cross-language parity vectors — bit-exact mirror of
// packages/rust/simgrid/src/heightfield.rs (PINNED_BITS) and epsilon-mirrored
// by packages/npm/laser heightfield.spec.ts. Regenerate from the Rust side:
// cargo test -p simgrid print_height_vectors -- --ignored --nocapture
bool FKBVEWorldHeightfieldVectorsTest::RunTest(const FString& Parameters)
{
	struct FVectorCase
	{
		int32 Seed;
		float X;
		float Y;
		uint32 Bits;
	};
	static const FVectorCase Cases[] = {
		{ 0, 0.0f, 0.0f, 0xC392E1EFu },
		{ 0, 1.0f, 1.0f, 0xC378DFD7u },
		{ 0, -1.0f, 1.0f, 0x42DC6DBDu },
		{ 0, 100.5f, -200.25f, 0xC27037BFu },
		{ (int32)0xC1A55E5Au, 0.0f, 0.0f, 0xC35C3C83u },
		{ (int32)0xC1A55E5Au, 64.0f, 64.0f, 0xC241D19Au },
		{ (int32)0xC1A55E5Au, -300.0f, 12.0f, 0xC395DAFBu },
		{ 1, 0.5f, 0.5f, 0xC3960000u },
		{ -1, 1024.0f, -1024.0f, 0xC32810B8u },
		{ 123456789, 3.25f, -7.75f, 0xC32E173Fu },
	};

	for (const FVectorCase& C : Cases)
	{
		const float H = FKBVEWorldHeightfield::HeightAt(C.Seed, C.X, C.Y);
		uint32 Bits;
		FMemory::Memcpy(&Bits, &H, sizeof(Bits));
		TestEqual(
			FString::Printf(TEXT("height(seed=%d, x=%f, y=%f) bits"), C.Seed, C.X, C.Y),
			Bits, C.Bits);
	}

	TestEqual(TEXT("SeedFromWorld truncation"), FKBVEWorldHeightfield::SeedFromWorld(0x123456789LL), (int32)0x23456789);
	TestEqual(TEXT("SeedFromWorld negative"), FKBVEWorldHeightfield::SeedFromWorld(-1LL), (int32)-1);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldHeightfieldFillGridTest,
	"KBVE.World.Heightfield.FillGridMatchesHeightAt",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// FillGrid is a second path to the same canonical heights, taken because
// HeightAt rebuilds both noise generators per sample. Bit-exact equality with
// HeightAt is what keeps it inside the cross-language contract above rather
// than beside it.
bool FKBVEWorldHeightfieldFillGridTest::RunTest(const FString& Parameters)
{
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(1337);
	const int32 Edge = 17;
	const float OriginX = -8.5f;
	const float OriginY = 3.25f;
	const float Step = 0.5f;

	TArray<float> Grid;
	Grid.SetNumUninitialized(Edge * Edge);
	FKBVEWorldHeightfield::FillGrid(Seed, OriginX, OriginY, Step, Edge, Grid);

	for (int32 Y = 0; Y < Edge; ++Y)
	{
		for (int32 X = 0; X < Edge; ++X)
		{
			const float Expected = FKBVEWorldHeightfield::HeightAt(Seed, OriginX + X * Step, OriginY + Y * Step);
			uint32 ExpectedBits, ActualBits;
			const float Actual = Grid[Y * Edge + X];
			FMemory::Memcpy(&ExpectedBits, &Expected, sizeof(ExpectedBits));
			FMemory::Memcpy(&ActualBits, &Actual, sizeof(ActualBits));
			TestEqual(FString::Printf(TEXT("FillGrid[%d,%d] bits"), X, Y), ActualBits, ExpectedBits);
		}
	}
	return true;
}



IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldRiverCoverageTest,
	"KBVE.World.Heightfield.RiverCoverage",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The guard on the river width knob, mirrored in simgrid and @kbve/laser. A
// river network is a thin thing: widen the band far enough and every tile is
// riverbed, which reads as a flooded world rather than a carved one and leaves
// the road router nowhere dry to go.
bool FKBVEWorldRiverCoverageTest::RunTest(const FString& Parameters)
{
	int32 Basin = 0;
	int32 Total = 0;
	for (int32 Gy = 0; Gy < 200; ++Gy)
	{
		for (int32 Gx = 0; Gx < 200; ++Gx)
		{
			const float X = Gx * 3.0f - 300.0f;
			const float Y = Gy * 3.0f - 300.0f;
			if (FKBVEWorldHeightfield::RiverMaskAt(1337, X, Y) > 0.98f)
			{
				++Basin;
			}
			++Total;
		}
	}

	const float Fraction = static_cast<float>(Basin) / static_cast<float>(Total);
	TestTrue(FString::Printf(TEXT("river basin %f is a network"), Fraction),
		Fraction > 0.005f && Fraction < 0.05f);
	return true;
}

#endif
