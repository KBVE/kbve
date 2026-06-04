#pragma once

#include "CoreMinimal.h"
#include "KBVEEvents.h"
#include "Subsystems/WorldSubsystem.h"
#include "chuckEventPayloads.h"
#include "chuckSimEvents.generated.h"

// Sim-domain bridge. Workers / Mass processors push POD payloads into the
// MPSC queues from any thread. UchuckSimEvents::Tick (game thread) drains
// every queue once per frame and forwards into UchuckUIEvents (or other
// game-thread channels) for actor / Slate / VFX consumers.
//
// CONTRACT:
//   Enqueue*: any thread, POD payloads only (no UObject ptrs).
//   Tick:     game thread; drains all queues and re-broadcasts.
//
// The pattern decouples Mass-side data flow from UObject world: workers
// never touch UObjects, the bridge is the single sync point per frame.
UCLASS()
class UchuckSimEvents : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	static UchuckSimEvents* Get(const UObject* WorldContext);

	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override { RETURN_QUICK_DECLARE_CYCLE_STAT(UchuckSimEvents, STATGROUP_Tickables); }
	virtual bool IsTickable() const override { return true; }
	virtual bool IsTickableInEditor() const override { return false; }

	TKBVEMpscQueue<FchuckCombatHitPayload>    CombatHits;
	TKBVEMpscQueue<FchuckEntityKilledPayload> Killed;
	TKBVEMpscQueue<FchuckPickupRequestPayload> Pickups;

	TKBVEChannel<FchuckCombatHitPayload>      OnCombatHit;
	TKBVEChannel<FchuckEntityKilledPayload>   OnKilled;
	TKBVEChannel<FchuckPickupRequestPayload>  OnPickup;
};
