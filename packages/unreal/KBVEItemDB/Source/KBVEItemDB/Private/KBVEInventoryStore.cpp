#include "KBVEInventoryStore.h"

#include "HAL/PlatformFileManager.h"
#include "Misc/Paths.h"

THIRD_PARTY_INCLUDES_START
#include "sqlite3.h"
THIRD_PARTY_INCLUDES_END

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

	sqlite3* AsHandle(void* P) { return reinterpret_cast<sqlite3*>(P); }
}

FKBVEInventoryStore::~FKBVEInventoryStore()
{
	Close();
}

bool FKBVEInventoryStore::Open(const FString& DbPath)
{
	if (Db) return true;

	IPlatformFile& FS = FPlatformFileManager::Get().GetPlatformFile();
	const FString DbDir = FPaths::GetPath(DbPath);
	if (!DbDir.IsEmpty()) FS.CreateDirectoryTree(*DbDir);

	const FTCHARToUTF8 Conv(*DbPath);
	sqlite3* Handle = nullptr;
	if (sqlite3_open_v2(Conv.Get(), &Handle, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nullptr) != SQLITE_OK)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEInventoryStore] open failed: %s"), UTF8_TO_TCHAR(Handle ? sqlite3_errmsg(Handle) : "null"));
		if (Handle) sqlite3_close(Handle);
		return false;
	}

	sqlite3_exec(Handle, "PRAGMA journal_mode=WAL;",   nullptr, nullptr, nullptr);
	sqlite3_exec(Handle, "PRAGMA synchronous=NORMAL;", nullptr, nullptr, nullptr);
	sqlite3_exec(Handle, "PRAGMA temp_store=MEMORY;",  nullptr, nullptr, nullptr);

	char* Err = nullptr;
	if (sqlite3_exec(Handle, kCreateSql, nullptr, nullptr, &Err) != SQLITE_OK)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEInventoryStore] create failed: %s"), UTF8_TO_TCHAR(Err ? Err : ""));
		sqlite3_free(Err);
		sqlite3_close(Handle);
		return false;
	}

	Db = Handle;
	UE_LOG(LogTemp, Display, TEXT("[KBVEInventoryStore] opened %s"), *DbPath);
	return true;
}

void FKBVEInventoryStore::Close()
{
	if (Db)
	{
		sqlite3_close(AsHandle(Db));
		Db = nullptr;
	}
}

bool FKBVEInventoryStore::InsertBag(const FString& PlayerId, const FKBVEInventoryBag& Bag)
{
	const FTCHARToUTF8 PlayerConv(*PlayerId);
	const FTCHARToUTF8 BagConv(*Bag.BagRef.ToString());

	sqlite3_stmt* Stmt = nullptr;
	if (sqlite3_prepare_v2(AsHandle(Db), kInsertSql, -1, &Stmt, nullptr) != SQLITE_OK) return false;

	bool bOk = true;
	for (int32 i = 0; i < Bag.Slots.Num(); ++i)
	{
		const FKBVEInventoryStack& Slot = Bag.Slots[i];
		if (Slot.IsEmpty()) continue;

		sqlite3_reset(Stmt);
		sqlite3_bind_text(Stmt, 1, PlayerConv.Get(), -1, SQLITE_TRANSIENT);
		sqlite3_bind_text(Stmt, 2, BagConv.Get(), -1, SQLITE_TRANSIENT);
		sqlite3_bind_int(Stmt, 3, i);
		sqlite3_bind_int(Stmt, 4, Slot.ItemKey);
		sqlite3_bind_int(Stmt, 5, Slot.Count);
		sqlite3_bind_int(Stmt, 6, Slot.Durability);
		sqlite3_bind_int(Stmt, 7, static_cast<int32>(Slot.Flags));

		if (sqlite3_step(Stmt) != SQLITE_DONE)
		{
			bOk = false;
			break;
		}
	}
	sqlite3_finalize(Stmt);
	return bOk;
}

bool FKBVEInventoryStore::SaveInventory(const FString& PlayerId, const FKBVEInventory& Inventory)
{
	if (!Db) return false;

	sqlite3_exec(AsHandle(Db), "BEGIN;", nullptr, nullptr, nullptr);

	const FTCHARToUTF8 PlayerConv(*PlayerId);
	sqlite3_stmt* DelStmt = nullptr;
	if (sqlite3_prepare_v2(AsHandle(Db), kDeleteSql, -1, &DelStmt, nullptr) == SQLITE_OK)
	{
		sqlite3_bind_text(DelStmt, 1, PlayerConv.Get(), -1, SQLITE_TRANSIENT);
		sqlite3_step(DelStmt);
		sqlite3_finalize(DelStmt);
	}

	const bool bOk = InsertBag(PlayerId, Inventory.DefaultBag) && InsertBag(PlayerId, Inventory.Hotbar);

	sqlite3_exec(AsHandle(Db), bOk ? "COMMIT;" : "ROLLBACK;", nullptr, nullptr, nullptr);
	return bOk;
}

void FKBVEInventoryStore::LoadBag(const FString& PlayerId, FKBVEInventoryBag& Bag) const
{
	for (FKBVEInventoryStack& Slot : Bag.Slots)
	{
		Slot = FKBVEInventoryStack();
	}

	const FTCHARToUTF8 PlayerConv(*PlayerId);
	const FTCHARToUTF8 BagConv(*Bag.BagRef.ToString());

	sqlite3_stmt* Stmt = nullptr;
	if (sqlite3_prepare_v2(AsHandle(Db), kLoadSql, -1, &Stmt, nullptr) != SQLITE_OK) return;

	sqlite3_bind_text(Stmt, 1, PlayerConv.Get(), -1, SQLITE_TRANSIENT);
	sqlite3_bind_text(Stmt, 2, BagConv.Get(), -1, SQLITE_TRANSIENT);

	while (sqlite3_step(Stmt) == SQLITE_ROW)
	{
		const int32 SlotIdx = sqlite3_column_int(Stmt, 0);
		if (!Bag.Slots.IsValidIndex(SlotIdx)) continue;

		FKBVEInventoryStack& Slot = Bag.Slots[SlotIdx];
		Slot.ItemKey    = sqlite3_column_int(Stmt, 1);
		Slot.Count      = sqlite3_column_int(Stmt, 2);
		Slot.Durability = sqlite3_column_int(Stmt, 3);
		Slot.Flags      = static_cast<uint8>(sqlite3_column_int(Stmt, 4));
	}
	sqlite3_finalize(Stmt);
}

bool FKBVEInventoryStore::LoadInventory(const FString& PlayerId, FKBVEInventory& Inventory) const
{
	if (!Db) return false;
	Inventory.DefaultBag.EnsureSize();
	Inventory.Hotbar.EnsureSize();
	LoadBag(PlayerId, Inventory.DefaultBag);
	LoadBag(PlayerId, Inventory.Hotbar);
	return true;
}

bool FKBVEInventoryStore::ClearPlayer(const FString& PlayerId)
{
	if (!Db) return false;
	const FTCHARToUTF8 PlayerConv(*PlayerId);
	sqlite3_stmt* Stmt = nullptr;
	if (sqlite3_prepare_v2(AsHandle(Db), kDeleteSql, -1, &Stmt, nullptr) != SQLITE_OK) return false;
	sqlite3_bind_text(Stmt, 1, PlayerConv.Get(), -1, SQLITE_TRANSIENT);
	const int32 Rc = sqlite3_step(Stmt);
	sqlite3_finalize(Stmt);
	return Rc == SQLITE_DONE;
}

int32 FKBVEInventoryStore::CountItem(const FString& PlayerId, int32 ItemKey) const
{
	if (!Db) return 0;
	const FTCHARToUTF8 PlayerConv(*PlayerId);
	sqlite3_stmt* Stmt = nullptr;
	if (sqlite3_prepare_v2(AsHandle(Db), kCountSql, -1, &Stmt, nullptr) != SQLITE_OK) return 0;
	sqlite3_bind_text(Stmt, 1, PlayerConv.Get(), -1, SQLITE_TRANSIENT);
	sqlite3_bind_int(Stmt, 2, ItemKey);
	int32 Total = 0;
	if (sqlite3_step(Stmt) == SQLITE_ROW)
	{
		Total = sqlite3_column_int(Stmt, 0);
	}
	sqlite3_finalize(Stmt);
	return Total;
}
