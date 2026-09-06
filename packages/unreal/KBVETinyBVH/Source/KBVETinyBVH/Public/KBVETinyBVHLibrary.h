#pragma once

#include "CoreMinimal.h"

/**
 * The only place tiny_bvh.h is included, because including it takes care.
 *
 * TinyBVH's built-in thread pool gates its Linux branch on `#ifdef
 * PLATFORM_LINUX`, and Unreal defines PLATFORM_LINUX on every platform -- as 0
 * off Linux, but defined all the same. Left alone, a Mac build compiles the
 * Linux path and fails on cpu_set_t. Hiding the macro takes that branch out on
 * every platform, which costs nothing worth having: all it does is pin the
 * library's workers to cores 1..N, and a third-party pool pinning threads
 * behind Unreal's task graph is a fight rather than a speedup.
 *
 * Include this rather than tiny_bvh.h, and prefer FKBVEBvhScene to either.
 */

#pragma push_macro("PLATFORM_LINUX")
#undef PLATFORM_LINUX

THIRD_PARTY_INCLUDES_START
#include "tiny_bvh.h"
THIRD_PARTY_INCLUDES_END

#pragma pop_macro("PLATFORM_LINUX")
