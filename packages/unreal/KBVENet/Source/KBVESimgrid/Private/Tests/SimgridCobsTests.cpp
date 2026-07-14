#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridCobs.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridCobsRoundtripTest,
	"KBVE.Simgrid.Cobs.Roundtrip",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridCobsRoundtripTest::RunTest(const FString& Parameters)
{
	TArray<uint8> Payload = { 0x11, 0x00, 0x00, 0x22, 0x33 };
	TArray<uint8> Encoded = FSimgridCobs::Encode(Payload);
	TestEqual("delimiter terminated", Encoded.Last(), (uint8)0x00);

	TArray<uint8> Decoded;
	const bool bOk = FSimgridCobs::Decode(Encoded, Decoded);
	TestTrue("decode ok", bOk);
	TestEqual("roundtrip length", Decoded.Num(), Payload.Num());
	for (int32 i = 0; i < Payload.Num(); ++i)
	{
		TestEqual(FString::Printf(TEXT("byte %d"), i), Decoded[i], Payload[i]);
	}
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridCobsTruncatedTest,
	"KBVE.Simgrid.Cobs.Truncated",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridCobsTruncatedTest::RunTest(const FString& Parameters)
{
	TArray<uint8> Truncated = { 0x03, 0x11, 0x22 };
	TArray<uint8> Decoded;
	const bool bOk = FSimgridCobs::Decode(Truncated, Decoded);
	TestFalse("decode fails on unterminated frame", bOk);
	return true;
}

#endif
