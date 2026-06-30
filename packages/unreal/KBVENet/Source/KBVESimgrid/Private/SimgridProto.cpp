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
