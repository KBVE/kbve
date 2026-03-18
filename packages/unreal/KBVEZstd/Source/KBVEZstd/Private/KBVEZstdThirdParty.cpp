/**
 * Compilation unit for zstd 1.5.7 (BSD).
 * https://github.com/facebook/zstd
 *
 * ZSTD_MULTITHREAD must NOT be defined — zstd uses #ifdef checks, so
 * even defining it to 0 activates pthread.h includes which break UE's
 * stripped Game-target sysroot.
 *
 * ZSTD_DISABLE_ASM avoids inline assembly for portable cross-platform builds.
 */

#define ZSTD_DISABLE_ASM 1
#undef ZSTD_MULTITHREAD

THIRD_PARTY_INCLUDES_START

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

// decompress
#include "decompress/huf_decompress.c"
#include "decompress/zstd_ddict.c"
#include "decompress/zstd_decompress.c"
#include "decompress/zstd_decompress_block.c"

THIRD_PARTY_INCLUDES_END
