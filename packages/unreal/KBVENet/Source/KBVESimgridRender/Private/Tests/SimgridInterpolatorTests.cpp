#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridInterpolator.h"
#include "SimgridProto.h"

static FSimgridSnapshot MakeSnap(uint32 TimeMs, uint32 Eid, int32 Qx, int32 Qy, int32 Z)
{
	FSimgridSnapshot S;
	S.ServerTimeMs = TimeMs;
	S.bKeyframe = true;
	FSimgridEntityDelta E;
	E.Eid = Eid;
	E.Qx = Qx;
	E.Qy = Qy;
	E.Z = Z;
	E.Facing = 0;
	E.Kind = 7;
	E.Owner = 3;
	S.Entities.Add(E);
	return S;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridInterpBracketTest,
	"KBVE.SimgridRender.Interp.Bracket",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridInterpBracketTest::RunTest(const FString& Parameters)
{
	FSimgridInterpolator Interp;
	Interp.Push(MakeSnap(1000, 2, 0, 0, 0));
	Interp.Push(MakeSnap(1100, 2, 320, 320, 10));

	FSimgridInterpState Out;
	const bool bOk = Interp.SampleEntity(2, 1050.0, Out);
	TestTrue("sampled", bOk);
	TestEqual("mid x", Out.WorldXY.X, FSimgridCoords::QuantToWorldXY(160, 160).X);
	TestEqual("mid z", Out.Z, 5);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridInterpClampTest,
	"KBVE.SimgridRender.Interp.Clamp",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridInterpClampTest::RunTest(const FString& Parameters)
{
	FSimgridInterpolator Interp;
	Interp.Push(MakeSnap(1000, 2, 0, 0, 0));
	Interp.Push(MakeSnap(1100, 2, 320, 0, 0));

	FSimgridInterpState Before;
	TestTrue("before oldest ok", Interp.SampleEntity(2, 500.0, Before));
	TestEqual("clamp to oldest", Before.WorldXY.X, 0.0);

	FSimgridInterpState After;
	TestTrue("after newest ok", Interp.SampleEntity(2, 5000.0, After));
	TestEqual("clamp to newest", After.WorldXY.X, FSimgridCoords::QuantToWorldXY(320, 0).X);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridInterpMissingTest,
	"KBVE.SimgridRender.Interp.Missing",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridInterpMissingTest::RunTest(const FString& Parameters)
{
	FSimgridInterpolator Interp;
	Interp.Push(MakeSnap(1000, 2, 0, 0, 0));

	FSimgridInterpState Single;
	TestTrue("single sample returns it", Interp.SampleEntity(2, 1000.0, Single));
	TestEqual("single x", Single.WorldXY.X, 0.0);

	FSimgridInterpState Unknown;
	TestFalse("unknown eid false", Interp.SampleEntity(999, 1000.0, Unknown));
	return true;
}

#endif
