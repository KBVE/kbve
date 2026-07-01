#include "Misc/AutomationTest.h"
#include "../chuckSimgridController.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FchuckArpgMoveIntentZero, "Chuck.Arpg.MoveIntent.Zero", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FchuckArpgMoveIntentZero::RunTest(const FString& Parameters)
{
	const FchuckMoveIntent R = AchuckSimgridController::BuildMoveIntent(FVector2D(0.0, 0.0), false);
	TestEqual(TEXT("zero Mx"), (int32)R.Mx, 0);
	TestEqual(TEXT("zero My"), (int32)R.My, 0);
	TestFalse(TEXT("zero run"), R.bRun);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FchuckArpgMoveIntentUp, "Chuck.Arpg.MoveIntent.Up", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FchuckArpgMoveIntentUp::RunTest(const FString& Parameters)
{
	const FchuckMoveIntent R = AchuckSimgridController::BuildMoveIntent(FVector2D(0.0, -1.0), false);
	TestEqual(TEXT("up Mx"), (int32)R.Mx, -90);
	TestEqual(TEXT("up My"), (int32)R.My, -90);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FchuckArpgMoveIntentRight, "Chuck.Arpg.MoveIntent.Right", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FchuckArpgMoveIntentRight::RunTest(const FString& Parameters)
{
	const FchuckMoveIntent R = AchuckSimgridController::BuildMoveIntent(FVector2D(1.0, 0.0), false);
	TestEqual(TEXT("right Mx"), (int32)R.Mx, 90);
	TestEqual(TEXT("right My"), (int32)R.My, -90);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FchuckArpgMoveIntentRun, "Chuck.Arpg.MoveIntent.Run", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FchuckArpgMoveIntentRun::RunTest(const FString& Parameters)
{
	const FchuckMoveIntent R = AchuckSimgridController::BuildMoveIntent(FVector2D(0.0, -1.0), true);
	TestTrue(TEXT("run flag passes through"), R.bRun);
	return true;
}

#endif
