#pragma once

#include "CoreMinimal.h"

struct FSimgridTile
{
	int32 X = 0;
	int32 Y = 0;
};

struct FSimgridMove
{
	uint32 Seq = 0;
	int8 Mx = 0;
	int8 My = 0;
	bool bRun = false;
	uint32 Tick = 0;
};

enum class EServerEventType : uint8 { Welcome, Snapshot, Ephemeral, Reject, Unknown };

struct FSimgridKindEntry
{
	uint16 Kind = 0;
	FString RefId;
	uint8 Cat = 0;
};

struct FSimgridStatusView
{
	uint8 Kind = 0;
	uint16 Remaining = 0;
};

struct FSimgridEntityDelta
{
	uint32 Eid = 0;
	uint16 Kind = 0;
	uint16 Owner = 0;
	FSimgridTile Tile;
	uint8 Facing = 0;
	uint8 Sub = 0;
	int32 Qx = 0;
	int32 Qy = 0;
	int16 Qvx = 0;
	int16 Qvy = 0;
	uint32 InputAck = 0;
	int32 Hp = 0;
	int32 MaxHp = 0;
	bool bDestroyed = false;
	int32 Z = 0;
	TArray<FSimgridStatusView> Effects;
	uint32 Piloting = 0;
};

struct FSimgridWelcome
{
	uint32 Protocol = 0;
	uint16 YourSlot = 0;
	uint64 Seed = 0;
	TArray<FSimgridKindEntry> Registry;
};

struct FSimgridPlayerView
{
	uint16 Slot = 0;
	FString Username;
	bool bConnected = false;
};

struct FSimgridSnapshot
{
	uint32 Tick = 0;
	uint32 ServerTimeMs = 0;
	uint32 InputAck = 0;
	TArray<FSimgridPlayerView> Players;
	TArray<FSimgridEntityDelta> Entities;
	bool bKeyframe = false;
};

struct FSimgridReject
{
	FString Reason;
};

struct FServerDecoded
{
	EServerEventType Type = EServerEventType::Unknown;
	FSimgridWelcome Welcome;
	FSimgridSnapshot Snapshot;
	uint16 EphemeralKind = 0;
	uint16 EphemeralTo = 0;
	TArray<uint8> EphemeralPayload;
	FSimgridReject Reject;
	bool bOk = false;
};

class KBVESIMGRID_API FProtoCodec
{
public:
	static TArray<uint8> RawJoinMatch(uint32 Protocol, const FString& Jwt, const FString& Username);
	static TArray<uint8> RawFrameMoveFellLeave(uint32 ClientTick, const FSimgridMove& Move, const FSimgridTile& FellTile);
	static TArray<uint8> RawFrameMove(uint32 ClientTick, const FSimgridMove& Move);

	static TArray<uint8> EncodeJoinMatch(uint32 Protocol, const FString& Jwt, const FString& Username);
	static TArray<uint8> EncodeMoveFrame(uint32 ClientTick, const FSimgridMove& Move);

	static FServerDecoded DecodeServerEvent(const TArray<uint8>& Frame);
	static FServerDecoded DecodeServerEventRaw(const TArray<uint8>& Body);
};
