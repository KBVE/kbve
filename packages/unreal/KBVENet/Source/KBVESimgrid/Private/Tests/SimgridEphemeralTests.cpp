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

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralProjectileTest,
	"KBVE.Simgrid.Ephemeral.Projectile",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralProjectileTest::RunTest(const FString& Parameters)
{
	const FSimgridProjectile P = FEphemeralCodec::DecodeProjectile(HexBytes(TEXT("020a050e04056172726f7701")));
	TestEqual("attacker", P.Attacker, (uint32)2);
	TestEqual("from.x", P.From.X, 5);
	TestEqual("from.y", P.From.Y, -3);
	TestEqual("to.x", P.To.X, 7);
	TestEqual("to.y", P.To.Y, 2);
	TestEqual("kind", P.Kind, FString(TEXT("arrow")));
	TestTrue("hit", P.bHit);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralEquippedTest,
	"KBVE.Simgrid.Ephemeral.Equipped",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralEquippedTest::RunTest(const FString& Parameters)
{
	const FSimgridEquipped E = FEphemeralCodec::DecodeEquipped(HexBytes(TEXT("010573776f726406776561706f6e0602")));
	TestTrue("has ref", E.bHasItemRef);
	TestEqual("ref", E.ItemRef, FString(TEXT("sword")));
	TestEqual("slot", E.Slot, FString(TEXT("weapon")));
	TestEqual("attack", E.Attack, 3);
	TestEqual("defense", E.Defense, 1);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralStatsTest,
	"KBVE.Simgrid.Ephemeral.Stats",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralStatsTest::RunTest(const FString& Parameters)
{
	const FSimgridStats S = FEphemeralCodec::DecodeStats(HexBytes(TEXT("0464c801500e031428")));
	TestEqual("level", S.Level, 2);
	TestEqual("xp", S.Xp, 50);
	TestEqual("xp_next", S.XpNext, 100);
	TestEqual("max_hp", S.MaxHp, 40);
	TestEqual("attack", S.Attack, 7);
	TestEqual("kills", S.Kills, (uint32)3);
	TestEqual("mp", S.Mp, 10);
	TestEqual("max_mp", S.MaxMp, 20);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralInventoryTest,
	"KBVE.Simgrid.Ephemeral.Inventory",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralInventoryTest::RunTest(const FString& Parameters)
{
	const FSimgridInventory Inv = FEphemeralCodec::DecodeInventory(HexBytes(TEXT("0200056172726f77030006706f74696f6e01")));
	TestEqual("count", Inv.Items.Num(), 2);
	TestEqual("i0 id", Inv.Items[0].Id, FString(TEXT("")));
	TestEqual("i0 ref", Inv.Items[0].ItemRef, FString(TEXT("arrow")));
	TestEqual("i0 count", Inv.Items[0].Count, (uint32)3);
	TestEqual("i1 id", Inv.Items[1].Id, FString(TEXT("")));
	TestEqual("i1 ref", Inv.Items[1].ItemRef, FString(TEXT("potion")));
	TestEqual("i1 count", Inv.Items[1].Count, (uint32)1);
	return true;
}

#endif
