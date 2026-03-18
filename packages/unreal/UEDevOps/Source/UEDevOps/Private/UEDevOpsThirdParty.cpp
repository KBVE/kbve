/**
 * Single compilation unit for all bundled third-party libraries.
 *
 * Libraries:
 *   yyjson 0.12.0  (MIT)   — Fast JSON serialization
 *   zstd   1.5.7   (BSD)   — Payload compression
 *
 * xxHash 0.8.3 (BSD-2) is header-only (XXH_INLINE_ALL) and compiled
 * inline where used — no source file needed here.
 *
 * NOTE: yyjson and zstd both define a U32 macro/typedef. yyjson is
 * included first, then its conflicting macros are undefined before zstd.
 */

THIRD_PARTY_INCLUDES_START

// ─── yyjson ──────────────────────────────────────────────────────────────────
#include "yyjson.c"

// Clean up yyjson's internal macros that conflict with zstd
#undef U32
#undef I32
#undef U64
#undef I64
#undef F64

// ─── zstd (compress + required common/decompress) ────────────────────────────
// Disable ASM for portable cross-platform compilation.
// Ensure ZSTD_MULTITHREAD is NOT defined — zstd uses #ifdef checks, so
// even defining it to 0 activates pthread.h includes which break UE's
// stripped Game-target sysroot. Undefined = no-op stubs in threading.h.
#define ZSTD_DISABLE_ASM 1
#undef ZSTD_MULTITHREAD

// common
#include "common/debug.c"
#include "common/entropy_common.c"
#include "common/error_private.c"
#include "common/fse_decompress.c"
#include "common/pool.c"
#include "common/threading.c"
#include "common/xxhash.c"
#include "common/zstd_common.c"

// compress
#include "compress/fse_compress.c"
#include "compress/hist.c"
#include "compress/huf_compress.c"
#include "compress/zstd_compress.c"
#include "compress/zstd_compress_literals.c"
#include "compress/zstd_compress_sequences.c"
#include "compress/zstd_compress_superblock.c"
#include "compress/zstd_double_fast.c"
#include "compress/zstd_fast.c"
#include "compress/zstd_lazy.c"
#include "compress/zstd_ldm.c"
#include "compress/zstd_opt.c"
#include "compress/zstd_preSplit.c"
#include "compress/zstdmt_compress.c"

// decompress (required by compress for shared frame/block types)
#include "decompress/huf_decompress.c"
#include "decompress/zstd_ddict.c"
#include "decompress/zstd_decompress.c"
#include "decompress/zstd_decompress_block.c"

THIRD_PARTY_INCLUDES_END
