#pragma once

#include "CoreMinimal.h"
#include "Math/RandomStream.h"

/**
 * Platform-stable deterministic seed primitives, shared by every KBVEWorld
 * module. The splitmix64-style mixer here is the single source of truth for
 * world determinism — coord-specific derivation (hex Q/R, square chunk XY)
 * lives in each module but must combine through CombineHash so seeds stay
 * identical across platforms and topologies.
 */
struct KBVEWORLDCORE_API FKBVEWorldSeed
{
	/** Avalanche mix of two 64-bit values. No dependency on GetTypeHash. */
	static uint64 CombineHash(uint64 A, uint64 B);

	/** Fold a base seed with an ordered list of components via CombineHash. */
	static int64 DeriveSeed(int64 Base, std::initializer_list<int64> Components);

	/** FRandomStream from a 64-bit seed, clamped to the stream's int32 domain. */
	static FRandomStream MakeStream(int64 Seed);
};
