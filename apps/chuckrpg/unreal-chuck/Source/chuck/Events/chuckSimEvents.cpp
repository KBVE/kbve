#include "chuckSimEvents.h"

#include "Engine/World.h"

UchuckSimEvents* UchuckSimEvents::Get(const UObject* WorldContext)
{
	if (!WorldContext) return nullptr;
	UWorld* World = WorldContext->GetWorld();
	return World ? World->GetSubsystem<UchuckSimEvents>() : nullptr;
}

void UchuckSimEvents::Tick(float DeltaTime)
{
	CombatHits.Drain([this](const FchuckCombatHitPayload& P) { OnCombatHit.Publish(P); });
	Killed.Drain    ([this](const FchuckEntityKilledPayload& P) { OnKilled.Publish(P);    });
	Pickups.Drain   ([this](const FchuckPickupRequestPayload& P) { OnPickup.Publish(P);  });
}
