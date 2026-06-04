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
