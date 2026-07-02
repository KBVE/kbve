#include "SimgridProto.h"
#include "SimgridPostcard.h"
#include "SimgridCobs.h"

static void WriteTile(FPostcardWriter& W, const FSimgridTile& T)
{
	W.VarI32(T.X);
	W.VarI32(T.Y);
}

static void WriteMove(FPostcardWriter& W, const FSimgridMove& M)
{
	W.Variant(1);
	W.VarU32(M.Seq);
	W.I8(M.Mx);
	W.I8(M.My);
	W.Bool(M.bRun);
	W.VarU32(M.Tick);
}

TArray<uint8> FProtoCodec::RawJoinMatch(uint32 Protocol, const FString& Jwt, const FString& Username)
{
	FPostcardWriter W;
	W.Variant(0);
	W.VarU32(Protocol);
	W.String(Jwt);
	W.String(Username);
	return W.Bytes();
}

TArray<uint8> FProtoCodec::RawFrameMoveFellLeave(uint32 ClientTick, const FSimgridMove& Move, const FSimgridTile& FellTile)
{
	FPostcardWriter W;
	W.Variant(1);
	W.VarU32(ClientTick);
	W.SeqLen(3);
	WriteMove(W, Move);
	W.Variant(24);
	WriteTile(W, FellTile);
	W.Variant(13);
	return W.Bytes();
}

static void WriteFrameMoveBody(FPostcardWriter& W, uint32 ClientTick, const FSimgridMove& Move)
{
	W.VarU32(ClientTick);
	W.SeqLen(1);
	WriteMove(W, Move);
}

TArray<uint8> FProtoCodec::RawFrameMove(uint32 ClientTick, const FSimgridMove& Move)
{
	FPostcardWriter W;
	W.Variant(1);
	WriteFrameMoveBody(W, ClientTick, Move);
	return W.Bytes();
}

TArray<uint8> FProtoCodec::EncodeJoinMatch(uint32 Protocol, const FString& Jwt, const FString& Username)
{
	return FSimgridCobs::Encode(RawJoinMatch(Protocol, Jwt, Username));
}

TArray<uint8> FProtoCodec::EncodeMoveFrame(uint32 ClientTick, const FSimgridMove& Move)
{
	return FSimgridCobs::Encode(RawFrameMove(ClientTick, Move));
}

static FSimgridTile ReadTile(FPostcardReader& R)
{
	FSimgridTile T;
	T.X = R.VarI32();
	T.Y = R.VarI32();
	return T;
}

static FSimgridEntityDelta ReadEntityDelta(FPostcardReader& R)
{
	FSimgridEntityDelta E;
	E.Eid = R.VarU32();
	E.Kind = R.U16();
	E.Owner = R.U16();
	E.Tile = ReadTile(R);
	E.Facing = R.U8();
	E.Sub = R.U8();
	E.Qx = R.VarI32();
	E.Qy = R.VarI32();
	E.Qvx = R.I16();
	E.Qvy = R.I16();
	E.InputAck = R.VarU32();
	E.Hp = R.VarI32();
	E.MaxHp = R.VarI32();
	E.bDestroyed = R.Bool();
	E.Z = R.VarI32();
	const int32 EffCount = R.SeqLen();
	for (int32 i = 0; i < EffCount; ++i)
	{
		FSimgridStatusView S;
		S.Kind = (uint8)R.Variant();
		S.Remaining = R.U16();
		E.Effects.Add(S);
	}
	E.Piloting = R.VarU32();
	E.Mp = R.VarI32();
	E.MaxMp = R.VarI32();
	E.Energy = R.VarI32();
	E.MaxEnergy = R.VarI32();
	E.Stamina = R.VarI32();
	E.MaxStamina = R.VarI32();
	return E;
}

static void ReadSnapshotBody(FPostcardReader& R, FSimgridSnapshot& Out)
{
	Out.Tick = R.VarU32();
	Out.ServerTimeMs = R.VarU32();
	Out.InputAck = R.VarU32();
	const int32 PlayerCount = R.SeqLen();
	for (int32 i = 0; i < PlayerCount; ++i)
	{
		FSimgridPlayerView P;
		P.Slot = R.U16();
		P.Username = R.String();
		P.bConnected = R.Bool();
		Out.Players.Add(P);
	}
	const int32 EntityCount = R.SeqLen();
	for (int32 i = 0; i < EntityCount; ++i)
	{
		Out.Entities.Add(ReadEntityDelta(R));
	}
	Out.bKeyframe = R.Bool();
}

FServerDecoded FProtoCodec::DecodeServerEventRaw(const TArray<uint8>& Body)
{
	FServerDecoded D;
	FPostcardReader R(Body);
	const uint32 Variant = R.Variant();
	switch (Variant)
	{
	case 0:
	{
		D.Type = EServerEventType::Welcome;
		D.Welcome.Protocol = R.VarU32();
		D.Welcome.YourSlot = R.U16();
		D.Welcome.Seed = R.VarU64();
		const int32 Count = R.SeqLen();
		for (int32 i = 0; i < Count; ++i)
		{
			FSimgridKindEntry K;
			K.Kind = R.U16();
			K.RefId = R.String();
			K.Cat = R.U8();
			D.Welcome.Registry.Add(K);
		}
		break;
	}
	case 1:
	{
		D.Type = EServerEventType::Snapshot;
		ReadSnapshotBody(R, D.Snapshot);
		break;
	}
	case 2:
	{
		D.Type = EServerEventType::Ephemeral;
		D.EphemeralKind = R.U16();
		D.EphemeralTo = R.U16();
		const int32 Len = R.SeqLen();
		for (int32 i = 0; i < Len; ++i)
		{
			D.EphemeralPayload.Add(R.U8());
		}
		break;
	}
	case 3:
	{
		D.Type = EServerEventType::Reject;
		D.Reject.Reason = R.String();
		break;
	}
	default:
		D.Type = EServerEventType::Unknown;
		break;
	}
	D.bOk = !R.HasError() && D.Type != EServerEventType::Unknown;
	return D;
}

FServerDecoded FProtoCodec::DecodeServerEvent(const TArray<uint8>& Frame)
{
	TArray<uint8> Body;
	FSimgridCobs::Decode(Frame, Body);
	return DecodeServerEventRaw(Body);
}

FSimgridUdpOffer FProtoCodec::DecodeUdpOffer(const TArray<uint8>& Payload)
{
	FSimgridUdpOffer Offer;
	FPostcardReader R(Payload);
	for (int32 i = 0; i < 16; ++i)
	{
		Offer.Token[i] = R.U8();
	}
	Offer.Port = R.U16();
	Offer.bOk = !R.HasError();
	return Offer;
}

TArray<uint8> FProtoCodec::EncodeUdpHello(uint32 Protocol, const uint8 (&Token)[16])
{
	FPostcardWriter W;
	W.Variant(0);
	W.VarU32(Protocol);
	for (int32 i = 0; i < 16; ++i)
	{
		W.U8(Token[i]);
	}
	return W.Bytes();
}

TArray<uint8> FProtoCodec::EncodeUdpFrameMove(uint32 ClientTick, const FSimgridMove& Move)
{
	FPostcardWriter W;
	W.Variant(2);
	WriteFrameMoveBody(W, ClientTick, Move);
	return W.Bytes();
}

FUdpDecoded FProtoCodec::DecodeUdpPacket(const TArray<uint8>& Datagram)
{
	FUdpDecoded D;
	FPostcardReader R(Datagram);
	const uint32 Variant = R.Variant();
	switch (Variant)
	{
	case 0:
		D.Type = EUdpPacketType::Hello;
		break;
	case 1:
		D.Type = EUdpPacketType::HelloAck;
		break;
	case 2:
		D.Type = EUdpPacketType::Frame;
		break;
	case 3:
		D.Type = EUdpPacketType::Snapshot;
		ReadSnapshotBody(R, D.Snapshot);
		break;
	default:
		D.Type = EUdpPacketType::Unknown;
		break;
	}
	D.bOk = !R.HasError() && D.Type != EUdpPacketType::Unknown;
	return D;
}
