/**
 * Shared warning-suppression prelude for the WAMR (2.2.0) amalgamation
 * partitions. WAMR is C; each partition is its own .c translation unit so
 * file-scope symbols (e.g. the `__ue` endianness probe in both math.c and
 * wasm_application.c) never collide. Include this first in every partition.
 */
#if defined(__clang__)
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunused-function"
#pragma clang diagnostic ignored "-Wunused-variable"
#pragma clang diagnostic ignored "-Wunused-but-set-variable"
#pragma clang diagnostic ignored "-Wsign-compare"
#pragma clang diagnostic ignored "-Wtautological-compare"
#pragma clang diagnostic ignored "-Wshadow"
#pragma clang diagnostic ignored "-Wshorten-64-to-32"
#pragma clang diagnostic ignored "-Wimplicit-fallthrough"
#pragma clang diagnostic ignored "-Wmissing-field-initializers"
#endif
