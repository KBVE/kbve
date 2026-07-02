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
		{ 0, 0.0f, 0.0f, 0x00000000u },
		{ 0, 1.0f, 1.0f, 0x42259454u },
		{ 0, -1.0f, 1.0f, 0x42E3B9A9u },
		{ 0, 100.5f, -200.25f, 0xC27037BFu },
		{ (int32)0xC1A55E5Au, 0.0f, 0.0f, 0x00000000u },
		{ (int32)0xC1A55E5Au, 64.0f, 64.0f, 0xC1D568A1u },
		{ (int32)0xC1A55E5Au, -300.0f, 12.0f, 0xC395DAFBu },
		{ 1, 0.5f, 0.5f, 0xC15522AFu },
		{ -1, 1024.0f, -1024.0f, 0xC2FA7051u },
		{ 123456789, 3.25f, -7.75f, 0xC32DF80Cu },
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

#endif
