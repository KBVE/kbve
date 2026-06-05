#pragma once

#include "CoreMinimal.h"
#include "MassEntityHandle.h"

// UI-domain payloads: emitted on the game thread, consumed by Slate / UMG.
struct FchuckHealthChangedPayload
{
	float Current = 0.f;
	float Max     = 0.f;
};

struct FchuckManaChangedPayload
{
	float Current = 0.f;
	float Max     = 0.f;
};

struct FchuckStaminaChangedPayload
{
	float Current     = 0.f;
	float Max         = 0.f;
	float RegenDelay  = 0.f;
};

struct FchuckInventoryDirtyPayload
{
	int32 BagIndex = 0;
};

struct FchuckDamageReceivedPayload
{
	float Amount    = 0.f;
	uint8 DamageBit = 0;
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

// Sim-domain payloads: enqueued from Mass workers, drained on the game thread.
struct FchuckCombatHitPayload
{
	FMassEntityHandle Source;
	FMassEntityHandle Target;
	float             Amount = 0.f;
	uint8             DamageBit = 0;
};

struct FchuckEntityKilledPayload
{
	FMassEntityHandle Entity;
	FMassEntityHandle KilledBy;
};

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
