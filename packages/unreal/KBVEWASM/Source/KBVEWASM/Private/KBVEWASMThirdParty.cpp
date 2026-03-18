/**
 * Compilation unit for WAMR 2.2.0 (Apache-2.0 WITH LLVM-exception).
 * https://github.com/bytecodealliance/wasm-micro-runtime
 *
 * Interpreter-only build (classic mode). AOT/JIT disabled.
 * Uses invokeNative_general.c for cross-platform portability.
 */

#include "CoreMinimal.h"

THIRD_PARTY_INCLUDES_START

// ── shared / platform ──────────────────────────────────────────────
#if PLATFORM_WINDOWS
#include "win_clock.c"
#include "win_file.c"
#include "win_malloc.c"
#include "win_memmap.c"
#include "win_socket.c"
#include "win_thread.c"
#include "win_time.c"
#include "win_util.c"
#elif PLATFORM_MAC
#include "platform_init.c"
#else // Linux / other POSIX
// Linux platform_init.c has the same name as darwin's but different path;
// the Build.cs include-path switch ensures the correct one is found.
#include "platform_init.c"
#endif

// POSIX platform layer (Mac + Linux)
#if !PLATFORM_WINDOWS
#include "posix_blocking_op.c"
#include "posix_clock.c"
#include "posix_malloc.c"
#include "posix_memmap.c"
#include "posix_sleep.c"
#include "posix_thread.c"
#include "posix_time.c"
#endif

// common platform helpers
#include "libc_errno.c"
#include "math.c"

// ── shared / memory allocator ──────────────────────────────────────
#include "mem_alloc.c"
#include "ems_alloc.c"
#include "ems_gc.c"
#include "ems_hmu.c"
#include "ems_kfc.c"

// ── shared / utils ─────────────────────────────────────────────────
#include "bh_assert.c"
#include "bh_bitmap.c"
#include "bh_common.c"
#include "bh_hashmap.c"
#include "bh_leb128.c"
#include "bh_list.c"
#include "bh_log.c"
#include "bh_queue.c"
#include "bh_vector.c"
#include "runtime_timer.c"

// ── iwasm / common ─────────────────────────────────────────────────
#include "wasm_application.c"
#include "wasm_blocking_op.c"
#include "wasm_c_api.c"
#include "wasm_exec_env.c"
#include "wasm_loader_common.c"
#include "wasm_memory.c"
#include "wasm_native.c"
#include "wasm_runtime_common.c"
#include "wasm_shared_memory.c"

// invokeNative — general C fallback (max 20 native args, fully portable)
#include "invokeNative_general.c"

// ── iwasm / libraries ──────────────────────────────────────────────
#include "libc_builtin_wrapper.c"

// ── iwasm / interpreter (classic) ──────────────────────────────────
#include "wasm_loader.c"
#include "wasm_runtime.c"
#include "wasm_interp_classic.c"

THIRD_PARTY_INCLUDES_END
