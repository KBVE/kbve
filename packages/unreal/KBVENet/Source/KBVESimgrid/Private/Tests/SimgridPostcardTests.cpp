#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridPostcard.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridPostcardPrimitivesTest,
	"KBVE.Simgrid.Postcard.Primitives",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridPostcardPrimitivesTest::RunTest(const FString& Parameters)
{
	FPostcardWriter W;
	W.VarU32(7);
	W.I8(-1);
	W.Bool(true);
	W.VarI32(-3);
	W.String(TEXT("h0ly"));
	W.U16(300);
	W.VarU64(0xC0FFEEull);

	FPostcardReader R(W.Bytes());
	TestEqual("u32", R.VarU32(), (uint32)7);
	TestEqual("i8", (int32)R.I8(), -1);
	TestTrue("bool", R.Bool());
	TestEqual("i32 zigzag", R.VarI32(), -3);
	TestEqual("string", R.String(), FString(TEXT("h0ly")));
	TestEqual("u16", (uint32)R.U16(), (uint32)300);
	TestEqual("u64", R.VarU64(), (uint64)0xC0FFEEull);
	TestTrue("consumed all", R.AtEnd());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridPostcardZigzagTest,
	"KBVE.Simgrid.Postcard.Zigzag",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridPostcardZigzagTest::RunTest(const FString& Parameters)
{
	const int32 Cases[] = { 0, -1, 1, 127, -128, 2147483647, -2147483648 };
	for (int32 V : Cases)
	{
		FPostcardWriter W;
		W.VarI32(V);
		FPostcardReader R(W.Bytes());
		TestEqual(FString::Printf(TEXT("zigzag %d"), V), R.VarI32(), V);
	}
	return true;
}

#endif
