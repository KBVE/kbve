#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridEphemeral.h"

static TArray<uint8> HexBytes(const FString& Hex)
{
	TArray<uint8> Out;
	for (int32 i = 0; i + 1 < Hex.Len(); i += 2)
	{
		Out.Add((uint8)FParse::HexNumber(*Hex.Mid(i, 2)));
	}
	return Out;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralCombatTest,
	"KBVE.Simgrid.Ephemeral.Combat",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralCombatTest::RunTest(const FString& Parameters)
{
	const FSimgridCombat C = FEphemeralCodec::DecodeCombat(HexBytes(TEXT("02070106676f626c696e0a0100")));
	TestEqual("attacker", C.Attacker, (uint32)2);
	TestEqual("target", C.Target, (uint32)7);
	TestTrue("has ref", C.bHasTargetRef);
	TestEqual("ref", C.TargetRef, FString(TEXT("goblin")));
	TestEqual("dmg", C.Dmg, 5);
	TestTrue("crit", C.bCrit);
	TestFalse("died", C.bDied);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralPickupTest,
	"KBVE.Simgrid.Ephemeral.Pickup",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralPickupTest::RunTest(const FString& Parameters)
{
	const FSimgridPickup P = FEphemeralCodec::DecodePickup(HexBytes(TEXT("056172726f7703")));
	TestEqual("ref", P.ItemRef, FString(TEXT("arrow")));
	TestEqual("count", P.Count, (uint32)3);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralItemUsedTest,
	"KBVE.Simgrid.Ephemeral.ItemUsed",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralItemUsedTest::RunTest(const FString& Parameters)
{
	const FSimgridItemUsed U = FEphemeralCodec::DecodeItemUsed(HexBytes(TEXT("06706f74696f6e18")));
	TestEqual("ref", U.ItemRef, FString(TEXT("potion")));
	TestEqual("heal", U.Heal, 12);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralStatusTest,
	"KBVE.Simgrid.Ephemeral.Status",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralStatusTest::RunTest(const FString& Parameters)
{
	const FSimgridStatus S = FEphemeralCodec::DecodeStatus(HexBytes(TEXT("030305")));
	TestEqual("kind", (int32)S.Kind, 3);
	TestEqual("magnitude", S.Magnitude, -2);
	TestEqual("remaining", S.Remaining, (uint32)5);
	return true;
}

#endif
