#pragma once

#include "CoreMinimal.h"
#include "KBVEItemTypes.h"
#include "KBVESQLiteConnection.h"

class KBVEITEMDB_API FKBVEItemCatalogStore
{
public:
	bool Open(const FString& DbPath);
	void Close();
	bool IsOpen() const { return Conn.IsOpen(); }

	bool SaveCatalog(const TArray<FKBVEItemDef>& Items);

	int32 GetKeysByTypeFlag(int32 Mask, TArray<int32>& OutKeys) const;
	int32 NumRows() const;

private:
	FKBVESQLiteConnection Conn;
};
