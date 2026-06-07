#include "KBVEInventoryStore.h"

namespace
{
	static const char* kCreateSql =
		"CREATE TABLE IF NOT EXISTS player_inventory ("
		" player_id TEXT NOT NULL,"
		" bag_ref TEXT NOT NULL,"
		" slot_idx INTEGER NOT NULL,"
		" item_key INTEGER NOT NULL,"
		" count INTEGER NOT NULL,"
		" durability INTEGER NOT NULL DEFAULT 0,"
		" flags INTEGER NOT NULL DEFAULT 0,"
		" PRIMARY KEY (player_id, bag_ref, slot_idx)"
		") WITHOUT ROWID;";

	static const char* kDeleteSql = "DELETE FROM player_inventory WHERE player_id = ?1;";
	static const char* kInsertSql =
		"INSERT INTO player_inventory(player_id, bag_ref, slot_idx, item_key, count, durability, flags)"
		" VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7);";
	static const char* kLoadSql =
		"SELECT slot_idx, item_key, count, durability, flags FROM player_inventory WHERE player_id = ?1 AND bag_ref = ?2;";
	static const char* kCountSql =
		"SELECT COALESCE(SUM(count), 0) FROM player_inventory WHERE player_id = ?1 AND item_key = ?2;";
}

bool FKBVEInventoryStore::Open(const FString& DbPath)
{
	if (!Conn.Open(DbPath)) return false;
	return Conn.Exec(kCreateSql);
}

void FKBVEInventoryStore::Close()
{
	Conn.Close();
}

bool FKBVEInventoryStore::InsertBag(const FString& PlayerId, const FKBVEInventoryBag& Bag)
{
	const FString BagRef = Bag.BagRef.ToString();
	TSharedPtr<FKBVESQLiteStatement> Stmt = Conn.Prepare(kInsertSql);
	if (!Stmt.IsValid()) return false;

	for (int32 i = 0; i < Bag.Slots.Num(); ++i)
	{
		const FKBVEInventoryStack& Slot = Bag.Slots[i];
		if (Slot.IsEmpty()) continue;

		Stmt->Reset();
		Stmt->BindText(1, PlayerId);
		Stmt->BindText(2, BagRef);
		Stmt->BindInt(3, i);
		Stmt->BindInt(4, Slot.ItemKey);
		Stmt->BindInt(5, Slot.Count);
		Stmt->BindInt(6, Slot.Durability);
		Stmt->BindInt(7, static_cast<int32>(Slot.Flags));
		if (!Stmt->Execute()) return false;
	}
	return true;
}

bool FKBVEInventoryStore::SaveInventory(const FString& PlayerId, const FKBVEInventory& Inventory)
{
	if (!Conn.IsOpen()) return false;

	Conn.Begin();
	if (TSharedPtr<FKBVESQLiteStatement> Del = Conn.Prepare(kDeleteSql))
	{
		Del->BindText(1, PlayerId);
		Del->Execute();
	}

	const bool bOk = InsertBag(PlayerId, Inventory.DefaultBag) && InsertBag(PlayerId, Inventory.Hotbar);

	if (bOk) Conn.Commit(); else Conn.Rollback();
	return bOk;
}

void FKBVEInventoryStore::LoadBag(const FString& PlayerId, FKBVEInventoryBag& Bag) const
{
	for (FKBVEInventoryStack& Slot : Bag.Slots)
	{
		Slot = FKBVEInventoryStack();
	}

	TSharedPtr<FKBVESQLiteStatement> Stmt = Conn.Prepare(kLoadSql);
	if (!Stmt.IsValid()) return;

	Stmt->BindText(1, PlayerId);
	Stmt->BindText(2, Bag.BagRef.ToString());

	while (Stmt->Step())
	{
		const int32 SlotIdx = Stmt->ColumnInt(0);
		if (!Bag.Slots.IsValidIndex(SlotIdx)) continue;

		FKBVEInventoryStack& Slot = Bag.Slots[SlotIdx];
		Slot.ItemKey    = Stmt->ColumnInt(1);
		Slot.Count      = Stmt->ColumnInt(2);
		Slot.Durability = Stmt->ColumnInt(3);
		Slot.Flags      = static_cast<uint8>(Stmt->ColumnInt(4));
	}
}

bool FKBVEInventoryStore::LoadInventory(const FString& PlayerId, FKBVEInventory& Inventory) const
{
	if (!Conn.IsOpen()) return false;
	Inventory.DefaultBag.EnsureSize();
	Inventory.Hotbar.EnsureSize();
	LoadBag(PlayerId, Inventory.DefaultBag);
	LoadBag(PlayerId, Inventory.Hotbar);
	return true;
}

bool FKBVEInventoryStore::ClearPlayer(const FString& PlayerId)
{
	if (!Conn.IsOpen()) return false;
	TSharedPtr<FKBVESQLiteStatement> Stmt = Conn.Prepare(kDeleteSql);
	if (!Stmt.IsValid()) return false;
	Stmt->BindText(1, PlayerId);
	return Stmt->Execute();
}

int32 FKBVEInventoryStore::CountItem(const FString& PlayerId, int32 ItemKey) const
{
	if (!Conn.IsOpen()) return 0;
	TSharedPtr<FKBVESQLiteStatement> Stmt = Conn.Prepare(kCountSql);
	if (!Stmt.IsValid()) return 0;
	Stmt->BindText(1, PlayerId);
	Stmt->BindInt(2, ItemKey);
	return Stmt->Step() ? Stmt->ColumnInt(0) : 0;
}
