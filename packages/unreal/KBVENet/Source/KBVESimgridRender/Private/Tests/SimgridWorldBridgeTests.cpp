#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridWorldBridge.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridWorldBridgeDeterminismTest,
	"KBVE.SimgridRender.World.Determinism",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridWorldBridgeDeterminismTest::RunTest(const FString& Parameters)
{
	USimgridWorldBridge* A = NewObject<USimgridWorldBridge>();
	USimgridWorldBridge* B = NewObject<USimgridWorldBridge>();
	A->Init(0xC0FFEE);
	B->Init(0xC0FFEE);

	const float Ha = A->SampleHeight(1234.0f, -567.0f);
	const float Hb = B->SampleHeight(1234.0f, -567.0f);
	TestEqual("same seed same height", Ha, Hb);

	USimgridWorldBridge* C = NewObject<USimgridWorldBridge>();
	C->Init(0xBADD1E);
	const float Hc = C->SampleHeight(1234.0f, -567.0f);
	TestNotEqual("different seed differs", Ha, Hc);

	return true;
}

#endif
