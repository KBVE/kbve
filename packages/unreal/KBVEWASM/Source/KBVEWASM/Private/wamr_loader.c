/* WAMR partition: classic bytecode loader (own TU — shares static helper
   names like set_error_buf/read_leb with the runtime and interpreter). */
#include "wamr_prelude.h"

#include "wasm_loader.c"

#if defined(__clang__)
#pragma clang diagnostic pop
#endif
