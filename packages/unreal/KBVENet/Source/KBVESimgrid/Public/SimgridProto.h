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

class KBVESIMGRID_API FProtoCodec
{
public:
	static TArray<uint8> RawJoinMatch(uint32 Protocol, const FString& Jwt, const FString& Username);
	static TArray<uint8> RawFrameMoveFellLeave(uint32 ClientTick, const FSimgridMove& Move, const FSimgridTile& FellTile);
	static TArray<uint8> RawFrameMove(uint32 ClientTick, const FSimgridMove& Move);

	static TArray<uint8> EncodeJoinMatch(uint32 Protocol, const FString& Jwt, const FString& Username);
	static TArray<uint8> EncodeMoveFrame(uint32 ClientTick, const FSimgridMove& Move);
};
