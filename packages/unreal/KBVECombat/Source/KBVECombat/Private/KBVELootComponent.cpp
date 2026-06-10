#include "KBVELootComponent.h"
#include "KBVECombatComponent.h"
#include "GameFramework/Actor.h"

UKBVELootComponent::UKBVELootComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UKBVELootComponent::BeginPlay()
{
	Super::BeginPlay();

	if (AActor* Owner = GetOwner())
	{
		if (UKBVECombatComponent* Combat = Owner->FindComponentByClass<UKBVECombatComponent>())
		{
			Combat->OnDeath.AddDynamic(this, &UKBVELootComponent::HandleDeath);
		}
	}
}

TArray<FKBVELootDrop> UKBVELootComponent::RollLoot() const
{
	TArray<FKBVELootDrop> Drops;
	for (const FKBVELootEntry& Entry : LootTable)
	{
		if (Entry.ItemRef.IsNone() || FMath::FRand() > Entry.DropRate)
		{
			continue;
		}
		FKBVELootDrop Drop;
		Drop.ItemRef = Entry.ItemRef;
		Drop.Quantity = FMath::RandRange(FMath::Max(1, Entry.MinQuantity), FMath::Max(Entry.MinQuantity, Entry.MaxQuantity));
		Drops.Add(Drop);
	}
	return Drops;
}

void UKBVELootComponent::HandleDeath(AActor* Killer)
{
	AActor* Owner = GetOwner();
	if (!Owner || !Owner->HasAuthority())
	{
		return;
	}
	const TArray<FKBVELootDrop> Drops = RollLoot();
	OnLootDropped.Broadcast(Drops, Killer);
}
