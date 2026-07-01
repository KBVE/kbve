#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridCoords.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridCoordsMapTest,
	"KBVE.SimgridRender.Coords.Map",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridCoordsMapTest::RunTest(const FString& Parameters)
{
	const FVector2D A = FSimgridCoords::QuantToWorldXY(160, -96);
	TestEqual("qx", A.X, 160.0 / 32.0 * 100.0);
	TestEqual("qy", A.Y, -96.0 / 32.0 * 100.0);

	const FVector2D T = FSimgridCoords::TileToWorldXY(5, -3);
	TestEqual("tile x", T.X, 500.0);
	TestEqual("tile y", T.Y, -300.0);

	const FVector2D V = FSimgridCoords::QuantVelToWorldXY(256, -128);
	TestEqual("vel x", V.X, 256.0 / 256.0 * 100.0);
	TestEqual("vel y", V.Y, -128.0 / 256.0 * 100.0);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridCoordsFacingTest,
	"KBVE.SimgridRender.Coords.Facing",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridCoordsFacingTest::RunTest(const FString& Parameters)
{
	TestEqual("down", FSimgridCoords::FacingToYaw(0), 0.0f);
	TestEqual("up", FSimgridCoords::FacingToYaw(1), 180.0f);
	TestEqual("left", FSimgridCoords::FacingToYaw(2), 90.0f);
	TestEqual("right", FSimgridCoords::FacingToYaw(3), 270.0f);
	TestEqual("unknown clamps to down", FSimgridCoords::FacingToYaw(99), 0.0f);
	return true;
}

#endif
