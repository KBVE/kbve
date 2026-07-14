#include "KBVEWorldSeed.h"

uint64 FKBVEWorldSeed::CombineHash(uint64 A, uint64 B)
{
	// Explicit arithmetic mixing — platform-stable, no dependency on GetTypeHash.
	// splitmix64-style finalizer for avalanche properties.
	A ^= B + 0x9E3779B97F4A7C15ULL + (A << 6) + (A >> 2);
	A ^= A >> 30;
	A *= 0xBF58476D1CE4E5B9ULL;
	A ^= A >> 27;
	A *= 0x94D049BB133111EBULL;
	A ^= A >> 31;
	return A;
}

int64 FKBVEWorldSeed::DeriveSeed(int64 Base, std::initializer_list<int64> Components)
{
	uint64 H = static_cast<uint64>(Base);
	for (const int64 Component : Components)
	{
		H = CombineHash(H, static_cast<uint64>(Component));
	}
	return static_cast<int64>(H);
}

FRandomStream FKBVEWorldSeed::MakeStream(int64 Seed)
{
	return FRandomStream(static_cast<int32>(Seed & 0x7FFFFFFF));
}
