#include "chuckDroppedItemPool.h"

#include "Engine/World.h"
#include "chuckDroppedItemActor.h"

bool UchuckDroppedItemPool::ShouldCreateSubsystem(UObject* Outer) const
{
	UWorld* W = Cast<UWorld>(Outer);
	if (!W) return false;
	return W->IsGameWorld();
}

void UchuckDroppedItemPool::OnWorldBeginPlay(UWorld& InWorld)
{
	Super::OnWorldBeginPlay(InWorld);

	AllActors.Reserve(InitialPoolSize);
	FreeActors.Reserve(InitialPoolSize);

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Params.ObjectFlags |= RF_Transient;

	for (int32 i = 0; i < InitialPoolSize; ++i)
	{
		AchuckDroppedItemActor* A = InWorld.SpawnActor<AchuckDroppedItemActor>(
			AchuckDroppedItemActor::StaticClass(),
			FVector(0, 0, -100000.f),
			FRotator::ZeroRotator, Params);
		if (!A) continue;
		A->Release();
		AllActors.Add(A);
		FreeActors.Add(A);
	}
}

void UchuckDroppedItemPool::Deinitialize()
{
	for (AchuckDroppedItemActor* A : AllActors)
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

AchuckDroppedItemActor* UchuckDroppedItemPool::SpawnDrop(int32 ItemKey, int32 Count, EchuckItemRarity Rarity, const FLinearColor& RarityColor, const FVector& Loc, UTexture2D* IconTexture, UTexture2D* HaloTexture, UMaterialInterface* SharedMat)
{
	if (ItemKey <= 0 || Count <= 0) return nullptr;

	AchuckDroppedItemActor* A = nullptr;
	while (FreeActors.Num() > 0 && !A)
	{
		A = FreeActors.Pop(EAllowShrinking::No);
		if (!IsValid(A)) { A = nullptr; }
	}
	if (!A)
	{
		UWorld* W = GetWorld();
		if (!W) return nullptr;
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		Params.ObjectFlags |= RF_Transient;
		A = W->SpawnActor<AchuckDroppedItemActor>(AchuckDroppedItemActor::StaticClass(), Loc, FRotator::ZeroRotator, Params);
		if (!A) return nullptr;
		AllActors.Add(A);
	}

	A->Acquire(ItemKey, Count, Rarity, RarityColor, Loc, IconTexture, HaloTexture, SharedMat);
	ActiveDrops.Add(A);
	return A;
}

void UchuckDroppedItemPool::ReleaseDrop(AchuckDroppedItemActor* Actor)
{
	if (!IsValid(Actor)) return;
	if (!Actor->IsActive()) return;
	Actor->Release();
	ActiveDrops.RemoveSingleSwap(Actor, EAllowShrinking::No);
	FreeActors.Add(Actor);
}
