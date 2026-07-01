#pragma once

#include "CoreMinimal.h"
#include "SimgridProto.h"

struct KBVESIMGRID_API FSimgridCombat
{
	uint32 Attacker = 0;
	uint32 Target = 0;
	bool bHasTargetRef = false;
	FString TargetRef;
	int32 Dmg = 0;
	bool bCrit = false;
	bool bDied = false;
};

struct KBVESIMGRID_API FSimgridPickup
{
	FString ItemRef;
	uint32 Count = 0;
};

struct KBVESIMGRID_API FSimgridItemUsed
{
	FString ItemRef;
	int32 Heal = 0;
};

struct KBVESIMGRID_API FSimgridStatus
{
	uint8 Kind = 0;
	int32 Magnitude = 0;
	uint32 Remaining = 0;
};

struct KBVESIMGRID_API FSimgridProjectile
{
	uint32 Attacker = 0;
	FSimgridTile From;
	FSimgridTile To;
	FString Kind;
	bool bHit = false;
};

struct KBVESIMGRID_API FSimgridEquipped
{
	bool bHasItemRef = false;
	FString ItemRef;
	FString Slot;
	int32 Attack = 0;
	int32 Defense = 0;
};

struct KBVESIMGRID_API FSimgridStats
{
	int32 Level = 0;
	int32 Xp = 0;
	int32 XpNext = 0;
	int32 MaxHp = 0;
	int32 Attack = 0;
	uint32 Kills = 0;
	int32 Mp = 0;
	int32 MaxMp = 0;
};

struct KBVESIMGRID_API FSimgridInvItem
{
	FString Id;
	FString ItemRef;
	uint32 Count = 0;
};

struct KBVESIMGRID_API FSimgridInventory
{
	TArray<FSimgridInvItem> Items;
};

class KBVESIMGRID_API FEphemeralCodec
{
public:
	static FSimgridCombat DecodeCombat(const TArray<uint8>& Payload);
	static FSimgridPickup DecodePickup(const TArray<uint8>& Payload);
	static FSimgridItemUsed DecodeItemUsed(const TArray<uint8>& Payload);
	static FSimgridStatus DecodeStatus(const TArray<uint8>& Payload);
	static FSimgridProjectile DecodeProjectile(const TArray<uint8>& Payload);
	static FSimgridEquipped DecodeEquipped(const TArray<uint8>& Payload);
	static FSimgridStats DecodeStats(const TArray<uint8>& Payload);
	static FSimgridInventory DecodeInventory(const TArray<uint8>& Payload);
};
