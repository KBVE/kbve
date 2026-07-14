#include "chuckNpcSpawner.h"
#include "chuckMovementPolicy.h"
#include "KBVEMovementPolicy.h"
#include "Mass/chuckSlimeSubsystem.h"
#include "Engine/World.h"

UKBVEMovementPolicy* UchuckNpcSpawner::GetPolicy()
{
	if (!Policy)
	{
		Policy = NewObject<UchuckMovementPolicy>(this);
	}
	return Policy;
}

void UchuckNpcSpawner::SpawnCreature(FName NpcRef, const FVector& Center, int32 Count, float Radius)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	FKBVEMovementContext Ctx;
	Ctx.bIsPlayerControlled = false;
	Ctx.bInCombat = false;
	Ctx.LocalPopulation = Count;
	Ctx.DistanceToViewer = 0.f;

	const EKBVEMovementBackend Backend = GetPolicy()->ResolveBackend(Ctx);

	UchuckSlimeSubsystem* Slimes = World->GetSubsystem<UchuckSlimeSubsystem>();
	switch (Backend)
	{
	case EKBVEMovementBackend::Mass:
		if (Slimes)
		{
			Slimes->SpawnSlimes(Center, Count, Radius);
		}
		break;
	default:
		UE_LOG(LogTemp, Warning, TEXT("[chuck] NpcSpawner: backend %d unimplemented for %s — falling back to Mass"),
			(int32)Backend, *NpcRef.ToString());
		if (Slimes)
		{
			Slimes->SpawnSlimes(Center, Count, Radius);
		}
		break;
	}
}
