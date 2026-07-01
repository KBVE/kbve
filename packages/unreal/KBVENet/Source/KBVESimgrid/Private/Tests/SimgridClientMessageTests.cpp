#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridProto.h"
#include "SimgridCobs.h"

static TArray<uint8> HexToBytes(const FString& Hex)
{
	TArray<uint8> Out;
	for (int32 i = 0; i + 1 < Hex.Len(); i += 2)
	{
		const int32 Hi = FParse::HexDigit(Hex[i]);
		const int32 Lo = FParse::HexDigit(Hex[i + 1]);
		Out.Add((uint8)((Hi << 4) | Lo));
	}
	return Out;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridFrameFixtureTest,
	"KBVE.Simgrid.Wire.Frame",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridFrameFixtureTest::RunTest(const FString& Parameters)
{
	FSimgridMove Move;
	Move.Seq = 3;
	Move.Mx = 127;
	Move.My = -1;
	Move.bRun = true;
	Move.Tick = 9;
	FSimgridTile Fell;
	Fell.X = 5;
	Fell.Y = -3;

	const TArray<uint8> Framed = FSimgridCobs::Encode(FProtoCodec::RawFrameMoveFellLeave(7, Move, Fell));
	const TArray<uint8> Expected = HexToBytes(TEXT("0e01070301037fff0109180a050d00"));
	TestEqual("frame byte length", Framed.Num(), Expected.Num());
	for (int32 i = 0; i < Expected.Num(); ++i)
	{
		TestEqual(FString::Printf(TEXT("frame byte %d"), i), Framed[i], Expected[i]);
	}
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridJoinMatchFixtureTest,
	"KBVE.Simgrid.Wire.JoinMatch",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridJoinMatchFixtureTest::RunTest(const FString& Parameters)
{
	const TArray<uint8> Framed = FProtoCodec::EncodeJoinMatch(15, TEXT("tok"), TEXT("h0ly"));
	const TArray<uint8> Expected = HexToBytes(TEXT("010b0f03746f6b0468306c7900"));
	TestEqual("joinmatch byte length", Framed.Num(), Expected.Num());
	for (int32 i = 0; i < Expected.Num(); ++i)
	{
		TestEqual(FString::Printf(TEXT("joinmatch byte %d"), i), Framed[i], Expected[i]);
	}
	return true;
}

#endif
