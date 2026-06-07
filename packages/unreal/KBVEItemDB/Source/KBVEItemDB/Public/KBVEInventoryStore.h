#pragma once

#include "CoreMinimal.h"
#include "KBVEInventoryTypes.h"
#include "KBVESQLiteConnection.h"

class KBVEITEMDB_API FKBVEInventoryStore
{
public:
	bool Open(const FString& DbPath);
	void Close();
	bool IsOpen() const { return Conn.IsOpen(); }

	bool SaveInventory(const FString& PlayerId, const FKBVEInventory& Inventory);
	bool LoadInventory(const FString& PlayerId, FKBVEInventory& Inventory) const;
	bool ClearPlayer(const FString& PlayerId);
	int32 CountItem(const FString& PlayerId, int32 ItemKey) const;

private:
	bool InsertBag(const FString& PlayerId, const FKBVEInventoryBag& Bag);
	void LoadBag(const FString& PlayerId, FKBVEInventoryBag& Bag) const;

	FKBVESQLiteConnection Conn;
};
