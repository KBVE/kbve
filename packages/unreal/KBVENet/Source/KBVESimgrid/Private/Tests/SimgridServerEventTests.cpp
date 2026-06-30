#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridProto.h"
#include "SimgridCobs.h"

static TArray<uint8> HexToBytes2(const FString& Hex)
{
	TArray<uint8> Out;
	for (int32 i = 0; i + 1 < Hex.Len(); i += 2)
	{
		Out.Add((uint8)((FParse::HexDigit(Hex[i]) << 4) | FParse::HexDigit(Hex[i + 1])));
	}
	return Out;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridWelcomeDecodeTest,
	"KBVE.Simgrid.Wire.WelcomeDecode",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridWelcomeDecodeTest::RunTest(const FString& Parameters)
{
	const TArray<uint8> Frame = HexToBytes2(TEXT("01160f03eeff830601010b77797665726e5f666972650100"));
	const FServerDecoded D = FProtoCodec::DecodeServerEvent(Frame);
	TestTrue("decoded ok", D.bOk);
	TestTrue("is welcome", D.Type == EServerEventType::Welcome);
	TestEqual("protocol", D.Welcome.Protocol, (uint32)15);
	TestEqual("your_slot", (uint32)D.Welcome.YourSlot, (uint32)3);
	TestEqual("seed", D.Welcome.Seed, (uint64)0xC0FFEEull);
	TestEqual("registry count", D.Welcome.Registry.Num(), 1);
	TestEqual("kind", (uint32)D.Welcome.Registry[0].Kind, (uint32)1);
	TestEqual("ref", D.Welcome.Registry[0].RefId, FString(TEXT("wyvern_fire")));
	TestEqual("cat", (uint32)D.Welcome.Registry[0].Cat, (uint32)1);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridSnapshotDecodeTest,
	"KBVE.Simgrid.Wire.SnapshotDecode",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridSnapshotDecodeTest::RunTest(const FString& Parameters)
{
	const TArray<uint8> Frame = HexToBytes2(TEXT("040109640109010207ffff030a050881c002bf01180d033c500501010305020100"));
	const FServerDecoded D = FProtoCodec::DecodeServerEvent(Frame);
	TestTrue("decoded ok", D.bOk);
	TestTrue("is snapshot", D.Type == EServerEventType::Snapshot);
	TestEqual("tick", D.Snapshot.Tick, (uint32)9);
	TestEqual("server_time_ms", D.Snapshot.ServerTimeMs, (uint32)100);
	TestEqual("input_ack", D.Snapshot.InputAck, (uint32)0);
	TestEqual("entity count", D.Snapshot.Entities.Num(), 1);
	TestTrue("keyframe", D.Snapshot.bKeyframe);
	return true;
}

#endif
