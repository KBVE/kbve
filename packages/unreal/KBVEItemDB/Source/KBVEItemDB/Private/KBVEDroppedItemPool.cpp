#include "KBVEDroppedItemPool.h"

#include "KBVEDroppedItemActor.h"
#include "Engine/World.h"

bool UKBVEDroppedItemPool::ShouldCreateSubsystem(UObject* Outer) const
{
	const UWorld* W = Cast<UWorld>(Outer);
	return W && W->IsGameWorld();
}

AKBVEDroppedItemActor* UKBVEDroppedItemPool::SpawnPooledActor(UWorld& World, const FVector& Loc)
{
	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Params.ObjectFlags |= RF_Transient;
	return World.SpawnActor<AKBVEDroppedItemActor>(AKBVEDroppedItemActor::StaticClass(), Loc, FRotator::ZeroRotator, Params);
}

void UKBVEDroppedItemPool::OnWorldBeginPlay(UWorld& InWorld)
{
	Super::OnWorldBeginPlay(InWorld);

	AllActors.Reserve(InitialPoolSize);
	FreeActors.Reserve(InitialPoolSize);

	for (int32 i = 0; i < InitialPoolSize; ++i)
	{
		AKBVEDroppedItemActor* A = SpawnPooledActor(InWorld, FVector(0.f, 0.f, -100000.f));
		if (!A) continue;
		A->Release();
		AllActors.Add(A);
		FreeActors.Add(A);
	}
}

void UKBVEDroppedItemPool::Deinitialize()
{
	for (AKBVEDroppedItemActor* A : AllActors)
	{
		if (IsValid(A))
		{
			A->Destroy();
		}
	}
	AllActors.Reset();
	FreeActors.Reset();
	ActiveDrops.Reset();
	Super::Deinitialize();
}

void UKBVEDroppedItemPool::SetVisualProvider(const TScriptInterface<IKBVEDroppedItemVisualProvider>& InProvider)
{
	VisualProvider = InProvider;
}

AKBVEDroppedItemActor* UKBVEDroppedItemPool::SpawnDrop(int32 ItemKey, int32 Count, const FVector& Loc)
{
	if (ItemKey <= 0 || Count <= 0) return nullptr;

	AKBVEDroppedItemActor* A = nullptr;
	while (FreeActors.Num() > 0 && !A)
	{
		A = FreeActors.Pop(EAllowShrinking::No);
		if (!IsValid(A)) { A = nullptr; }
	}
	if (!A)
	{
		UWorld* W = GetWorld();
		if (!W) return nullptr;
		A = SpawnPooledActor(*W, Loc);
		if (!A) return nullptr;
		AllActors.Add(A);
	}

	FKBVEDroppedItemVisual Visual;
	if (IKBVEDroppedItemVisualProvider* Provider = Cast<IKBVEDroppedItemVisualProvider>(VisualProvider.GetObject()))
	{
		Provider->GetDroppedItemVisual(ItemKey, Visual);
	}

	A->Acquire(ItemKey, Count, Loc, Visual);
	ActiveDrops.Add(A);
	return A;
}

void UKBVEDroppedItemPool::ReleaseDrop(AKBVEDroppedItemActor* Actor)
{
	if (!IsValid(Actor) || !Actor->IsActive()) return;
	Actor->Release();
	ActiveDrops.RemoveSingleSwap(Actor, EAllowShrinking::No);
	FreeActors.Add(Actor);
}

void UKBVEDroppedItemPool::HandlePickupComplete(AKBVEDroppedItemActor* Actor, AActor* Picker)
{
	if (!IsValid(Actor)) return;
	const int32 Key = Actor->GetItemKey();
	const int32 Count = Actor->GetCount();
	ReleaseDrop(Actor);
	if (Key > 0 && Count > 0)
	{
		OnItemPickedUp.Broadcast(Picker, Key, Count);
	}
}
