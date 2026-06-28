/**
 * Compilation unit for SQLite 3.53.3 (Public Domain).
 * https://sqlite.org
 *
 * This file MUST remain .c (not .cpp) because sqlite3.c uses "new" as a
 * variable name, which is a reserved keyword in C++.
 *
 * Compile-time options:
 * - SQLITE_THREADSAFE=1: serialized mode (safe for UE async tasks)
 * - SQLITE_ENABLE_FTS5: full-text search v5
 * - SQLITE_ENABLE_JSON1: JSON functions
 * - SQLITE_ENABLE_RTREE: R*Tree index for spatial queries
 * - SQLITE_DQS=0: disable double-quoted strings (SQL standard compliance)
 * - SQLITE_DEFAULT_WAL_SYNCHRONOUS=1: WAL mode with NORMAL sync (fast + safe)
 */

#define SQLITE_THREADSAFE 1
#define SQLITE_ENABLE_FTS5 1
#define SQLITE_ENABLE_JSON1 1
#define SQLITE_ENABLE_RTREE 1
#define SQLITE_DQS 0
#define SQLITE_DEFAULT_WAL_SYNCHRONOUS 1

/**
 * Prefix every exported sqlite3_* symbol with kbve_ so this threadsafe copy can
 * coexist with the engine's game-thread SQLiteCore in a monolithic binary. Must
 * be included BEFORE sqlite3.c so the renames apply to the definitions. See the
 * header for the full rationale (UE 5.8 upgrade).
 */
#include "sqlite3_prefix.h"

#include "sqlite3.c"
