#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridReconcile.h"
#include "SimgridProto.h"

static FSimgridEntityDelta Ent(uint32 Eid, bool bDestroyed = false)
{
	FSimgridEntityDelta E;
	E.Eid = Eid;
	E.bDestroyed = bDestroyed;
	return E;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridReconcileDespawnTest,
	"KBVE.SimgridRender.Reconcile.Despawn",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridReconcileDespawnTest::RunTest(const FString& Parameters)
{
	TSet<uint32> Live = { 1, 2, 3 };
	TArray<FSimgridEntityDelta> Keyframe = { Ent(2), Ent(3), Ent(4) };

	const TSet<uint32> Gone = FSimgridReconcile::DespawnSet(Live, Keyframe);
	TestTrue("1 despawned", Gone.Contains(1));
	TestFalse("2 kept", Gone.Contains(2));
	TestFalse("4 not in live", Gone.Contains(4));
	TestEqual("only one gone", Gone.Num(), 1);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridReconcileDestroyedTest,
	"KBVE.SimgridRender.Reconcile.Destroyed",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridReconcileDestroyedTest::RunTest(const FString& Parameters)
{
	TArray<FSimgridEntityDelta> Ents = { Ent(1, true), Ent(2, false), Ent(3, true) };
	const TSet<uint32> Dead = FSimgridReconcile::DestroyedIds(Ents);
	TestTrue("1 dead", Dead.Contains(1));
	TestFalse("2 alive", Dead.Contains(2));
	TestTrue("3 dead", Dead.Contains(3));
	return true;
}

#endif
