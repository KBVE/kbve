#pragma once

#include "CoreMinimal.h"

class KBVESQLITE_API FKBVESQLiteStatement
{
public:
	FKBVESQLiteStatement(void* InDb, const char* Sql);
	~FKBVESQLiteStatement();

	bool IsValid() const { return Stmt != nullptr; }

	void BindInt(int32 Index, int32 Value);
	void BindInt64(int32 Index, int64 Value);
	void BindText(int32 Index, const FString& Value);
	void BindBlob(int32 Index, const TArray<uint8>& Value);

	bool Step() const;       // true on a row (SQLITE_ROW)
	bool Execute() const;    // true on completion (SQLITE_DONE)
	void Reset();

	int32   ColumnInt(int32 Col) const;
	int64   ColumnInt64(int32 Col) const;
	FString ColumnText(int32 Col) const;
	bool    ColumnBlob(int32 Col, TArray<uint8>& OutBlob) const;

private:
	void* Stmt = nullptr;
};

class KBVESQLITE_API FKBVESQLiteConnection
{
public:
	FKBVESQLiteConnection() = default;
	~FKBVESQLiteConnection();

	FKBVESQLiteConnection(const FKBVESQLiteConnection&) = delete;
	FKBVESQLiteConnection& operator=(const FKBVESQLiteConnection&) = delete;

	bool Open(const FString& DbPath, bool bUseWAL = true);
	void Close();
	bool IsOpen() const { return Db != nullptr; }

	bool Exec(const char* Sql);

	TSharedPtr<FKBVESQLiteStatement> Prepare(const char* Sql) const;

	void Begin();
	void Commit();
	void Rollback();

	void* GetRawHandle() const { return Db; }

private:
	void* Db = nullptr;
};
