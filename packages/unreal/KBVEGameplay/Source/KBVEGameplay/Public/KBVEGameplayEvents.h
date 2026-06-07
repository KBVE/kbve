#pragma once

#include "CoreMinimal.h"
#include "MassEntityHandle.h"

// Shared gameplay event payloads — the cross-game vocabulary for stat / combat
// signals. Plain POD structs; transport (channels, MPSC queues) is the game's,
// these are just the contract a KBVE game and reusable UI agree on.

struct FKBVEHealthChangedPayload
{
	float Current = 0.f;
	float Max     = 0.f;
};

struct FKBVEManaChangedPayload
{
	float Current = 0.f;
	float Max     = 0.f;
};

struct FKBVEStaminaChangedPayload
{
	float Current    = 0.f;
	float Max        = 0.f;
	float RegenDelay = 0.f;
};

struct FKBVEDamageReceivedPayload
{
	float Amount    = 0.f;
	uint8 DamageBit = 0;
};

struct FKBVECombatHitPayload
{
	FMassEntityHandle Source;
	FMassEntityHandle Target;
	float             Amount    = 0.f;
	uint8             DamageBit = 0;
};

struct FKBVEEntityKilledPayload
{
	FMassEntityHandle Entity;
	FMassEntityHandle KilledBy;
};
