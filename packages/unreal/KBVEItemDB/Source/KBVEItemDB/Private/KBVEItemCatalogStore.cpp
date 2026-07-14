#include "KBVEItemCatalogStore.h"

namespace
{
	static const char* kCreateSql =
		"CREATE TABLE IF NOT EXISTS item_def ("
		" key INTEGER PRIMARY KEY,"
		" ref TEXT NOT NULL,"
		" name TEXT,"
		" type_flags INTEGER NOT NULL DEFAULT 0,"
		" rarity INTEGER NOT NULL DEFAULT 0,"
		" max_stack INTEGER NOT NULL DEFAULT 1,"
		" stackable INTEGER NOT NULL DEFAULT 0,"
		" consumable INTEGER NOT NULL DEFAULT 0,"
		" buy_price INTEGER NOT NULL DEFAULT 0,"
		" sell_price INTEGER NOT NULL DEFAULT 0"
		");";

	static const char* kUpsertSql =
		"INSERT INTO item_def(key, ref, name, type_flags, rarity, max_stack, stackable, consumable, buy_price, sell_price)"
		" VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
		" ON CONFLICT(key) DO UPDATE SET"
		" ref=excluded.ref, name=excluded.name, type_flags=excluded.type_flags, rarity=excluded.rarity,"
		" max_stack=excluded.max_stack, stackable=excluded.stackable, consumable=excluded.consumable,"
		" buy_price=excluded.buy_price, sell_price=excluded.sell_price;";

	static const char* kByTypeSql = "SELECT key FROM item_def WHERE (type_flags & ?1) != 0;";
	static const char* kCountSql  = "SELECT COUNT(*) FROM item_def;";
}

bool FKBVEItemCatalogStore::Open(const FString& DbPath)
{
	if (!Conn.Open(DbPath)) return false;
	return Conn.Exec(kCreateSql);
}

void FKBVEItemCatalogStore::Close()
{
	Conn.Close();
}

bool FKBVEItemCatalogStore::SaveCatalog(const TArray<FKBVEItemDef>& Items)
{
	if (!Conn.IsOpen()) return false;

	Conn.Begin();
	TSharedPtr<FKBVESQLiteStatement> Stmt = Conn.Prepare(kUpsertSql);
	if (!Stmt.IsValid())
	{
		Conn.Rollback();
		return false;
	}

	bool bOk = true;
	for (const FKBVEItemDef& Def : Items)
	{
		Stmt->Reset();
		Stmt->BindInt(1, Def.Key);
		Stmt->BindText(2, Def.Ref.ToString());
		Stmt->BindText(3, Def.Name);
		Stmt->BindInt(4, Def.TypeFlags);
		Stmt->BindInt(5, static_cast<int32>(Def.Rarity));
		Stmt->BindInt(6, Def.MaxStack);
		Stmt->BindInt(7, Def.bStackable ? 1 : 0);
		Stmt->BindInt(8, Def.bConsumable ? 1 : 0);
		Stmt->BindInt(9, Def.BuyPrice);
		Stmt->BindInt(10, Def.SellPrice);
		if (!Stmt->Execute())
		{
			bOk = false;
			break;
		}
	}

	if (bOk) Conn.Commit(); else Conn.Rollback();
	return bOk;
}

int32 FKBVEItemCatalogStore::GetKeysByTypeFlag(int32 Mask, TArray<int32>& OutKeys) const
{
	OutKeys.Reset();
	if (!Conn.IsOpen()) return 0;
	TSharedPtr<FKBVESQLiteStatement> Stmt = Conn.Prepare(kByTypeSql);
	if (!Stmt.IsValid()) return 0;
	Stmt->BindInt(1, Mask);
	while (Stmt->Step())
	{
		OutKeys.Add(Stmt->ColumnInt(0));
	}
	return OutKeys.Num();
}

int32 FKBVEItemCatalogStore::NumRows() const
{
	if (!Conn.IsOpen()) return 0;
	TSharedPtr<FKBVESQLiteStatement> Stmt = Conn.Prepare(kCountSql);
	if (!Stmt.IsValid()) return 0;
	return Stmt->Step() ? Stmt->ColumnInt(0) : 0;
}
