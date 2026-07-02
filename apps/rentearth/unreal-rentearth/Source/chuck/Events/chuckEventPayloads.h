#pragma once

#include "CoreMinimal.h"
#include "Mass/EntityHandle.h"
#include "KBVEGameplayEvents.h"

// Generic stat/combat payloads (Health / Mana / Stamina / DamageReceived /
// CombatHit / EntityKilled) live in KBVEGameplay's KBVEGameplayEvents.h. Only
// chuck-specific payloads remain below.

struct FchuckInventoryDirtyPayload
{
	int32 BagIndex = 0;
};

struct FchuckCrosshairPayload
{
	bool bOnTarget = false;
};

struct FchuckTooltipPayload
{
	bool         bShow = false;
	FText        Text;
	FText        Subtitle;
	FText        Body;
	FLinearColor BorderColor = FLinearColor::White;
	FLinearColor TitleColor  = FLinearColor::White;
	FVector2D    ScreenPos = FVector2D::ZeroVector;
};

struct FchuckItemConsumedPayload
{
	int32 ItemKey = 0;
	float HealHP    = 0.f;
	float RestoreMP = 0.f;
	float RestoreEP = 0.f;
};

struct FchuckToastPayload
{
	FText  Title;
	FText  Message;
	uint8  Level = 0;
};

// Sim-domain payloads: enqueued from Mass workers, drained on the game thread.
struct FchuckPickupRequestPayload
{
	FMassEntityHandle Source;
	int32             ItemKey = 0;
	int32             Count   = 1;
};

// Auth-domain payloads: bridge KBVESupabase delegates onto the chuck event bus
// so UI widgets do not need a direct reference to the subsystem.
struct FchuckAuthStatusPayload
{
	bool    bSignedIn = false;
	FString UserId;
	FString Email;
	FString KbveUsername;
};

struct FchuckAuthErrorPayload
{
	int32   HttpStatus = 0;
	FString Code;
	FString Message;
};

struct FchuckChatStatePayload
{
	bool bConnected = false;
};

struct FchuckChatLinePayload
{
	FString Channel;
	FString Nick;
	FString Sender;
	FString Platform;
	FString Kind;
	FString Body;
	bool    bIsEvent = false;
};

struct FchuckUiFlagsPayload
{
	uint32 NewFlags = 0;
	uint32 OldFlags = 0;
	uint32 Diff     = 0;
	uint32 Added() const   { return NewFlags & Diff; }
	uint32 Removed() const { return OldFlags & Diff; }
};
