#include "KBVESQLiteConnection.h"

#include "HAL/PlatformFileManager.h"
#include "Misc/Paths.h"

THIRD_PARTY_INCLUDES_START
#include "sqlite3.h"
THIRD_PARTY_INCLUDES_END

namespace
{
	sqlite3* AsDb(void* P) { return reinterpret_cast<sqlite3*>(P); }
	sqlite3_stmt* AsStmt(void* P) { return reinterpret_cast<sqlite3_stmt*>(P); }
}

FKBVESQLiteStatement::FKBVESQLiteStatement(void* InDb, const char* Sql)
{
	if (InDb)
	{
		sqlite3_stmt* Prepared = nullptr;
		if (sqlite3_prepare_v2(AsDb(InDb), Sql, -1, &Prepared, nullptr) == SQLITE_OK)
		{
			Stmt = Prepared;
		}
	}
}

FKBVESQLiteStatement::~FKBVESQLiteStatement()
{
	if (Stmt)
	{
		sqlite3_finalize(AsStmt(Stmt));
		Stmt = nullptr;
	}
}

void FKBVESQLiteStatement::BindInt(int32 Index, int32 Value)
{
	if (Stmt) sqlite3_bind_int(AsStmt(Stmt), Index, Value);
}

void FKBVESQLiteStatement::BindInt64(int32 Index, int64 Value)
{
	if (Stmt) sqlite3_bind_int64(AsStmt(Stmt), Index, Value);
}

void FKBVESQLiteStatement::BindText(int32 Index, const FString& Value)
{
	if (!Stmt) return;
	const FTCHARToUTF8 Conv(*Value);
	sqlite3_bind_text(AsStmt(Stmt), Index, Conv.Get(), -1, SQLITE_TRANSIENT);
}

void FKBVESQLiteStatement::BindBlob(int32 Index, const TArray<uint8>& Value)
{
	if (Stmt) sqlite3_bind_blob(AsStmt(Stmt), Index, Value.GetData(), Value.Num(), SQLITE_TRANSIENT);
}

bool FKBVESQLiteStatement::Step() const
{
	return Stmt && sqlite3_step(AsStmt(Stmt)) == SQLITE_ROW;
}

bool FKBVESQLiteStatement::Execute() const
{
	return Stmt && sqlite3_step(AsStmt(Stmt)) == SQLITE_DONE;
}

void FKBVESQLiteStatement::Reset()
{
	if (Stmt) sqlite3_reset(AsStmt(Stmt));
}

int32 FKBVESQLiteStatement::ColumnInt(int32 Col) const
{
	return Stmt ? sqlite3_column_int(AsStmt(Stmt), Col) : 0;
}

int64 FKBVESQLiteStatement::ColumnInt64(int32 Col) const
{
	return Stmt ? sqlite3_column_int64(AsStmt(Stmt), Col) : 0;
}

FString FKBVESQLiteStatement::ColumnText(int32 Col) const
{
	if (!Stmt) return FString();
	const unsigned char* Text = sqlite3_column_text(AsStmt(Stmt), Col);
	return Text ? FString(UTF8_TO_TCHAR(reinterpret_cast<const char*>(Text))) : FString();
}

bool FKBVESQLiteStatement::ColumnBlob(int32 Col, TArray<uint8>& OutBlob) const
{
	if (!Stmt) return false;
	const void* Bytes = sqlite3_column_blob(AsStmt(Stmt), Col);
	const int32 N = sqlite3_column_bytes(AsStmt(Stmt), Col);
	if (Bytes && N > 0)
	{
		OutBlob.SetNumUninitialized(N);
		FMemory::Memcpy(OutBlob.GetData(), Bytes, N);
		return true;
	}
	return false;
}

FKBVESQLiteConnection::~FKBVESQLiteConnection()
{
	Close();
}

bool FKBVESQLiteConnection::Open(const FString& DbPath, bool bUseWAL)
{
	if (Db) return true;

	IPlatformFile& FS = FPlatformFileManager::Get().GetPlatformFile();
	const FString DbDir = FPaths::GetPath(DbPath);
	if (!DbDir.IsEmpty()) FS.CreateDirectoryTree(*DbDir);

	const FTCHARToUTF8 Conv(*DbPath);
	sqlite3* Handle = nullptr;
	if (sqlite3_open_v2(Conv.Get(), &Handle, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nullptr) != SQLITE_OK)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVESQLite] open failed: %s"), UTF8_TO_TCHAR(Handle ? sqlite3_errmsg(Handle) : "null"));
		if (Handle) sqlite3_close(Handle);
		return false;
	}

	if (bUseWAL)
	{
		sqlite3_exec(Handle, "PRAGMA journal_mode=WAL;",   nullptr, nullptr, nullptr);
		sqlite3_exec(Handle, "PRAGMA synchronous=NORMAL;", nullptr, nullptr, nullptr);
		sqlite3_exec(Handle, "PRAGMA temp_store=MEMORY;",  nullptr, nullptr, nullptr);
	}

	Db = Handle;
	return true;
}

void FKBVESQLiteConnection::Close()
{
	if (Db)
	{
		sqlite3_close(AsDb(Db));
		Db = nullptr;
	}
}

bool FKBVESQLiteConnection::Exec(const char* Sql)
{
	if (!Db) return false;
	char* Err = nullptr;
	const int32 Rc = sqlite3_exec(AsDb(Db), Sql, nullptr, nullptr, &Err);
	if (Rc != SQLITE_OK)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVESQLite] exec failed: %s"), UTF8_TO_TCHAR(Err ? Err : ""));
		sqlite3_free(Err);
		return false;
	}
	return true;
}

TSharedPtr<FKBVESQLiteStatement> FKBVESQLiteConnection::Prepare(const char* Sql) const
{
	if (!Db) return nullptr;
	TSharedPtr<FKBVESQLiteStatement> Stmt = MakeShared<FKBVESQLiteStatement>(Db, Sql);
	return Stmt->IsValid() ? Stmt : nullptr;
}

void FKBVESQLiteConnection::Begin()    { Exec("BEGIN;"); }
void FKBVESQLiteConnection::Commit()   { Exec("COMMIT;"); }
void FKBVESQLiteConnection::Rollback() { Exec("ROLLBACK;"); }
