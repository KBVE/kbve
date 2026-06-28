/* WAMR partition: platform layer + libc helpers (separate TU). */
#include "wamr_prelude.h"

#if defined(_WIN32)
#include "win_clock.c"
#include "win_file.c"
#include "win_malloc.c"
#include "win_memmap.c"
#include "win_socket.c"
#include "win_thread.c"
#include "win_time.c"
#include "win_util.c"
#else /* macOS / Linux / other POSIX — Build.cs selects the platform include dir */
#include "platform_init.c"
#include "posix_blocking_op.c"
#include "posix_clock.c"
#include "posix_malloc.c"
#include "posix_memmap.c"
#include "posix_sleep.c"
#include "posix_thread.c"
#include "posix_time.c"
#endif

#include "libc_errno.c"
/* math.c is WAMR's libm fallback for platforms without one; Mac/Linux/Win
   provide libm via the system, so it must not be compiled here. */

#if defined(__clang__)
#pragma clang diagnostic pop
#endif
