/* WAMR partition: memory allocator + shared utils (separate TU). */
#include "wamr_prelude.h"

#include "mem_alloc.c"
#include "ems_alloc.c"
#include "ems_gc.c"
#include "ems_hmu.c"
#include "ems_kfc.c"

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

#if defined(__clang__)
#pragma clang diagnostic pop
#endif
