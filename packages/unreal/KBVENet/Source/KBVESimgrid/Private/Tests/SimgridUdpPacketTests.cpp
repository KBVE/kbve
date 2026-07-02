#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridProto.h"

static TArray<uint8> UdpHexToBytes(const FString& Hex)
{
	TArray<uint8> Out;
	for (int32 i = 0; i + 1 < Hex.Len(); i += 2)
	{
		Out.Add((uint8)((FParse::HexDigit(Hex[i]) << 4) | FParse::HexDigit(Hex[i + 1])));
	}
	return Out;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridUdpHelloFixtureTest,
	"KBVE.Simgrid.Udp.HelloFixture",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridUdpHelloFixtureTest::RunTest(const FString& Parameters)
{
	uint8 Token[16];
	for (int32 i = 0; i < 16; ++i)
	{
		Token[i] = static_cast<uint8>(i);
	}
	const TArray<uint8> Bytes = FProtoCodec::EncodeUdpHello(16, Token);
	FString Hex;
	for (uint8 B : Bytes)
	{
		Hex += FString::Printf(TEXT("%02x"), B);
	}
	TestEqual(TEXT("hello fixture"), Hex, FString(TEXT("0010000102030405060708090a0b0c0d0e0f")));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridUdpAckDecodeTest,
	"KBVE.Simgrid.Udp.AckDecode",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridUdpAckDecodeTest::RunTest(const FString& Parameters)
{
	TArray<uint8> Ack;
	Ack.Add(0x01);
	const FUdpDecoded Decoded = FProtoCodec::DecodeUdpPacket(Ack);
	TestTrue(TEXT("ok"), Decoded.bOk);
	TestTrue(TEXT("type"), Decoded.Type == EUdpPacketType::HelloAck);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridUdpFrameMoveTest,
	"KBVE.Simgrid.Udp.FrameMove",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridUdpFrameMoveTest::RunTest(const FString& Parameters)
{
	FSimgridMove Move;
	Move.Seq = 5;
	Move.Mx = 1;
	Move.My = -1;
	Move.bRun = true;
	Move.Tick = 42;
	const TArray<uint8> Frame = FProtoCodec::EncodeUdpFrameMove(42, Move);
	const TArray<uint8> Raw = FProtoCodec::RawFrameMove(42, Move);
	TestEqual(TEXT("discriminant"), Frame[0], (uint8)0x02);
	TestEqual(TEXT("body length"), Frame.Num() - 1, Raw.Num());
	bool bBodyMatches = true;
	for (int32 i = 0; i < Raw.Num(); ++i)
	{
		if (Frame[i + 1] != Raw[i])
		{
			bBodyMatches = false;
			break;
		}
	}
	TestTrue(TEXT("body matches RawFrameMove"), bBodyMatches);
	const FUdpDecoded Decoded = FProtoCodec::DecodeUdpPacket(Frame);
	TestTrue(TEXT("ok"), Decoded.bOk);
	TestTrue(TEXT("type"), Decoded.Type == EUdpPacketType::Frame);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridUdpOfferDecodeTest,
	"KBVE.Simgrid.Udp.OfferDecode",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridUdpOfferDecodeTest::RunTest(const FString& Parameters)
{
	const TArray<uint8> Payload = UdpHexToBytes(TEXT("000102030405060708090a0b0c0d0e0fc801"));
	const FSimgridUdpOffer Offer = FProtoCodec::DecodeUdpOffer(Payload);
	TestTrue(TEXT("ok"), Offer.bOk);
	TestEqual(TEXT("port"), (uint32)Offer.Port, (uint32)200);
	bool bTokenMatches = true;
	for (int32 i = 0; i < 16; ++i)
	{
		if (Offer.Token[i] != (uint8)i)
		{
			bTokenMatches = false;
			break;
		}
	}
	TestTrue(TEXT("token matches"), bTokenMatches);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridUdpSnapshotDecodeTest,
	"KBVE.Simgrid.Udp.SnapshotDecode",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridUdpSnapshotDecodeTest::RunTest(const FString& Parameters)
{
	const TArray<uint8> Datagram = UdpHexToBytes(
		TEXT("0309640000010207ffff030a050081c002bf01180d003c5000010103050000000000000001"));
	const FUdpDecoded Decoded = FProtoCodec::DecodeUdpPacket(Datagram);
	TestTrue(TEXT("ok"), Decoded.bOk);
	TestTrue(TEXT("type"), Decoded.Type == EUdpPacketType::Snapshot);
	TestEqual(TEXT("tick"), Decoded.Snapshot.Tick, (uint32)9);
	TestEqual(TEXT("server_time_ms"), Decoded.Snapshot.ServerTimeMs, (uint32)100);
	TestEqual(TEXT("input_ack"), Decoded.Snapshot.InputAck, (uint32)0);
	TestEqual(TEXT("entity count"), Decoded.Snapshot.Entities.Num(), 1);
	TestTrue(TEXT("keyframe"), Decoded.Snapshot.bKeyframe);
	if (Decoded.Snapshot.Entities.Num() > 0)
	{
		const FSimgridEntityDelta& E = Decoded.Snapshot.Entities[0];
		TestEqual(TEXT("eid"), E.Eid, (uint32)2);
		TestEqual(TEXT("kind"), (uint32)E.Kind, (uint32)7);
		TestEqual(TEXT("owner"), (uint32)E.Owner, (uint32)65535);
		TestEqual(TEXT("tile x"), E.Tile.X, (int32)5);
		TestEqual(TEXT("tile y"), E.Tile.Y, (int32)-3);
		TestEqual(TEXT("sub"), (uint32)E.Sub, (uint32)0x81);
		TestEqual(TEXT("qx"), E.Qx, (int32)160);
		TestEqual(TEXT("qy"), E.Qy, (int32)-96);
		TestEqual(TEXT("qvx"), (int32)E.Qvx, (int32)12);
		TestEqual(TEXT("qvy"), (int32)E.Qvy, (int32)-7);
		TestEqual(TEXT("hp"), E.Hp, (int32)30);
		TestEqual(TEXT("max_hp"), E.MaxHp, (int32)40);
		TestFalse(TEXT("destroyed"), E.bDestroyed);
		TestEqual(TEXT("z"), E.Z, (int32)-1);
		TestEqual(TEXT("effects num"), E.Effects.Num(), 1);
		if (E.Effects.Num() > 0)
		{
			TestEqual(TEXT("effects[0].remaining"), (uint32)E.Effects[0].Remaining, (uint32)5);
		}
	}
	return true;
}

#endif
