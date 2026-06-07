#include "KBVEInventoryStoreSubsystem.h"

#include "Misc/Paths.h"

void UKBVEInventoryStoreSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	const FString DbPath = FPaths::ProjectSavedDir() / TEXT("KBVE/inventory.db");
	Store.Open(DbPath);
}

void UKBVEInventoryStoreSubsystem::Deinitialize()
{
	Store.Close();
	Super::Deinitialize();
}

bool UKBVEInventoryStoreSubsystem::OpenAt(const FString& DbPath)
{
	Store.Close();
	return Store.Open(DbPath);
}

bool UKBVEInventoryStoreSubsystem::SaveInventory(const FString& PlayerId, const FKBVEInventory& Inventory)
{
	return Store.SaveInventory(PlayerId, Inventory);
}

bool UKBVEInventoryStoreSubsystem::LoadInventory(const FString& PlayerId, FKBVEInventory& Inventory)
{
	return Store.LoadInventory(PlayerId, Inventory);
}

int32 UKBVEInventoryStoreSubsystem::CountItem(const FString& PlayerId, int32 ItemKey)
{
	return Store.CountItem(PlayerId, ItemKey);
}

bool UKBVEInventoryStoreSubsystem::ClearPlayer(const FString& PlayerId)
{
	return Store.ClearPlayer(PlayerId);
}
