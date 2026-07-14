/* WAMR partition: classic interpreter loop (own TU). Defines stack push/pop
   macros and a static read_leb that clash with the loader and runtime. */
#include "wamr_prelude.h"

#include "wasm_interp_classic.c"

#if defined(__clang__)
#pragma clang diagnostic pop
#endif
