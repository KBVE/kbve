#include "KBVEWorldChunkCache.h"

#include "HAL/PlatformFileManager.h"
#include "Misc/Paths.h"

THIRD_PARTY_INCLUDES_START
#include "sqlite3.h"
THIRD_PARTY_INCLUDES_END

namespace
{
	static const char* kCreateSql =
		"CREATE TABLE IF NOT EXISTS chunks ("
		" seed INTEGER NOT NULL,"
		" x INTEGER NOT NULL,"
		" y INTEGER NOT NULL,"
		" data BLOB NOT NULL,"
		" PRIMARY KEY (seed, x, y)"
		") WITHOUT ROWID;";

	static const char* kReadSql  = "SELECT data FROM chunks WHERE seed = ?1 AND x = ?2 AND y = ?3;";
	static const char* kWriteSql = "INSERT INTO chunks(seed, x, y, data) VALUES(?1, ?2, ?3, ?4) ON CONFLICT(seed, x, y) DO UPDATE SET data = excluded.data;";
	static const char* kHasSql   = "SELECT 1 FROM chunks WHERE seed = ?1 AND x = ?2 AND y = ?3 LIMIT 1;";

	sqlite3* AsHandle(void* P) { return reinterpret_cast<sqlite3*>(P); }
}

FKBVEWorldChunkCache::~FKBVEWorldChunkCache()
{
	Close();
}

bool FKBVEWorldChunkCache::Open(const FString& DbPath)
{
	if (Db) return true;

	IPlatformFile& FS = FPlatformFileManager::Get().GetPlatformFile();
	const FString DbDir = FPaths::GetPath(DbPath);
	if (!DbDir.IsEmpty()) FS.CreateDirectoryTree(*DbDir);

	const FTCHARToUTF8 Conv(*DbPath);
	sqlite3* Handle = nullptr;
	if (sqlite3_open_v2(Conv.Get(), &Handle, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nullptr) != SQLITE_OK)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEWorldChunkCache] open failed: %s"), UTF8_TO_TCHAR(Handle ? sqlite3_errmsg(Handle) : "null"));
		if (Handle) sqlite3_close(Handle);
		return false;
	}

	sqlite3_exec(Handle, "PRAGMA journal_mode=WAL;",   nullptr, nullptr, nullptr);
	sqlite3_exec(Handle, "PRAGMA synchronous=NORMAL;", nullptr, nullptr, nullptr);
	sqlite3_exec(Handle, "PRAGMA temp_store=MEMORY;",  nullptr, nullptr, nullptr);

	char* Err = nullptr;
	if (sqlite3_exec(Handle, kCreateSql, nullptr, nullptr, &Err) != SQLITE_OK)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEWorldChunkCache] create failed: %s"), UTF8_TO_TCHAR(Err ? Err : ""));
		sqlite3_free(Err);
		sqlite3_close(Handle);
		return false;
	}

	Db = Handle;
	UE_LOG(LogTemp, Display, TEXT("[KBVEWorldChunkCache] opened %s"), *DbPath);
	return true;
}

void FKBVEWorldChunkCache::Close()
{
	if (Db)
	{
		sqlite3_close(AsHandle(Db));
		Db = nullptr;
	}
}

bool FKBVEWorldChunkCache::Read(uint32 Seed, const FIntPoint& Coord, TArray<uint8>& OutBlob)
{
	if (!Db) return false;
	sqlite3_stmt* Stmt = nullptr;
	if (sqlite3_prepare_v2(AsHandle(Db), kReadSql, -1, &Stmt, nullptr) != SQLITE_OK) return false;

	sqlite3_bind_int64(Stmt, 1, static_cast<int64>(Seed));
	sqlite3_bind_int(Stmt, 2, Coord.X);
	sqlite3_bind_int(Stmt, 3, Coord.Y);

	bool bHit = false;
	if (sqlite3_step(Stmt) == SQLITE_ROW)
	{
		const void* Bytes = sqlite3_column_blob(Stmt, 0);
		const int32 N     = sqlite3_column_bytes(Stmt, 0);
		if (Bytes && N > 0)
		{
			OutBlob.SetNumUninitialized(N);
			FMemory::Memcpy(OutBlob.GetData(), Bytes, N);
			bHit = true;
		}
	}
	sqlite3_finalize(Stmt);
	return bHit;
}

bool FKBVEWorldChunkCache::Write(uint32 Seed, const FIntPoint& Coord, const TArray<uint8>& Blob)
{
	if (!Db || Blob.Num() == 0) return false;
	sqlite3_stmt* Stmt = nullptr;
	if (sqlite3_prepare_v2(AsHandle(Db), kWriteSql, -1, &Stmt, nullptr) != SQLITE_OK) return false;

	sqlite3_bind_int64(Stmt, 1, static_cast<int64>(Seed));
	sqlite3_bind_int(Stmt, 2, Coord.X);
	sqlite3_bind_int(Stmt, 3, Coord.Y);
	sqlite3_bind_blob(Stmt, 4, Blob.GetData(), Blob.Num(), SQLITE_TRANSIENT);

	const int32 Rc = sqlite3_step(Stmt);
	sqlite3_finalize(Stmt);
	return Rc == SQLITE_DONE;
}

bool FKBVEWorldChunkCache::HasKey(uint32 Seed, const FIntPoint& Coord)
{
	if (!Db) return false;
	sqlite3_stmt* Stmt = nullptr;
	if (sqlite3_prepare_v2(AsHandle(Db), kHasSql, -1, &Stmt, nullptr) != SQLITE_OK) return false;

	sqlite3_bind_int64(Stmt, 1, static_cast<int64>(Seed));
	sqlite3_bind_int(Stmt, 2, Coord.X);
	sqlite3_bind_int(Stmt, 3, Coord.Y);

	const bool bHit = (sqlite3_step(Stmt) == SQLITE_ROW);
	sqlite3_finalize(Stmt);
	return bHit;
}
