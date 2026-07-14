# KBVESQLite

Embedded SQLite for KBVE Unreal Engine plugins — a vendored `sqlite3` amalgamation plus a thin RAII wrapper so consumers never touch raw `sqlite3_*` calls.

## What it provides

- **Vendored `sqlite3`** (3.51.x) exposed via `PublicIncludePaths` (`#include "sqlite3.h"`), with default symbol visibility so consumer modules link directly against this plugin's binary.
- **`FKBVESQLiteConnection`** — RAII connection wrapper:
    - `Open(path, bUseWAL=true)` / `Close()` / `IsOpen()`
    - `Exec(sql)` — fire-and-forget statements
    - `Prepare(sql)` → `TSharedPtr<FKBVESQLiteStatement>`
    - `Begin()` / `Commit()` / `Rollback()`
- **`FKBVESQLiteStatement`** — RAII prepared statement:
    - `BindInt` / `BindInt64` / `BindText` / `BindBlob`
    - `Step()` (row), `Execute()` (done), `Reset()`
    - `ColumnInt` / `ColumnInt64` / `ColumnText` / `ColumnBlob`
- **`FKBVESettingsStore`** (`KBVESettingsStore.h`) — scoped key/value prefs store
  on top of a connection (`kv_settings(scope, key, value)`, UPSERT). Typed
  `SetString/Int/Float/Bool` + `GetString/Int/Float/Bool`, `RemoveKey`,
  `LoadScope(scope, TMap&)`. The agnostic primitive for game/editor settings —
  the UI lives in KBVEUI, the persistence lives here.

## Usage

```cpp
#include "KBVESQLiteConnection.h"

FKBVESQLiteConnection Conn;
Conn.Open(FPaths::ProjectSavedDir() / TEXT("KBVE/data.db")); // WAL on
Conn.Exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v INTEGER);");

Conn.Begin();
if (TSharedPtr<FKBVESQLiteStatement> S = Conn.Prepare("INSERT INTO kv(k,v) VALUES(?1,?2);"))
{
    S->BindText(1, TEXT("gold"));
    S->BindInt(2, 500);
    S->Execute();
}
Conn.Commit();

if (TSharedPtr<FKBVESQLiteStatement> Q = Conn.Prepare("SELECT v FROM kv WHERE k=?1;"))
{
    Q->BindText(1, TEXT("gold"));
    if (Q->Step()) { int32 Gold = Q->ColumnInt(0); }
}
```

Add `"KBVESQLite"` to your module's `PrivateDependencyModuleNames`, and (for the CI plugin build) add `dependency_plugins: packages/unreal/KBVESQLite` to your ci-registry MDX so it's staged.

## Rules

- **Single sqlite provider.** Do **not** also link the engine's `SQLiteCore` in the same module — two vendored `sqlite3` copies produce duplicate `sqlite3_*` symbols and crash the build/run. KBVE code uses KBVESQLite only.
- **Persistence boundary, not a hot-loop datasource.** A single connection is not thread-safe; WAL allows many readers + one writer only across _separate_ connections. Don't query SQLite inside a Mass `ParallelForEachEntityChunk` loop — load at boundaries (spawn/login), keep the working set in memory / Mass fragments, flush at intervals/logout (game thread or async task).

## Consumers

- `FKBVEWorldChunkCache` (KBVEWorld) — terrain chunk BLOB cache.
- `FKBVEInventoryStore` / `FKBVEItemCatalogStore` (KBVEItemDB) — inventory persistence + queryable item catalog.
- `FKBVESettingsStore` — used by chuck's `UchuckSettings` (window geometry) under the `Saved/KBVE/settings.db` `window` scope.
