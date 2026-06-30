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

TArray<uint8> FProtoCodec::RawFrameMove(uint32 ClientTick, const FSimgridMove& Move)
{
	FPostcardWriter W;
	W.Variant(1);
	W.VarU32(ClientTick);
	W.SeqLen(1);
	WriteMove(W, Move);
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
	return E;
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
		D.Snapshot.Tick = R.VarU32();
		D.Snapshot.ServerTimeMs = R.VarU32();
		D.Snapshot.InputAck = R.VarU32();
		const int32 PlayerCount = R.SeqLen();
		if (PlayerCount != 0)
		{
			D.bOk = false;
			return D;
		}
		const int32 EntityCount = R.SeqLen();
		for (int32 i = 0; i < EntityCount; ++i)
		{
			D.Snapshot.Entities.Add(ReadEntityDelta(R));
		}
		D.Snapshot.bKeyframe = R.Bool();
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
