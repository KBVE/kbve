#include "HexWorldSeedSubsystem.h"

void UHexWorldSeedSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
}

void UHexWorldSeedSubsystem::Deinitialize()
{
	Super::Deinitialize();
}

// --- Seed Configuration ------------------------------------------

void UHexWorldSeedSubsystem::SetWorldSeed(const FWorldSeedKey& InSeedKey)
{
	SeedKey = InSeedKey;
}

// --- Deterministic Derivation ------------------------------------

int64 UHexWorldSeedSubsystem::DeriveRegionSeed(const FHexCoord& Coord) const
{
	// Hash(WorldSeed, Q, R, ContentVersion)
	uint64 H = CombineHash(static_cast<uint64>(SeedKey.WorldSeed), static_cast<uint64>(Coord.Q));
	H = CombineHash(H, static_cast<uint64>(Coord.R));
	H = CombineHash(H, static_cast<uint64>(SeedKey.ContentVersion));
	return static_cast<int64>(H);
}

int64 UHexWorldSeedSubsystem::DeriveCellSeed(const FHexCoord& HexCoord, int32 CellX, int32 CellY) const
{
	// Hash(RegionSeed, CellX, CellY, ContentVersion)
	const uint64 RegionSeed = static_cast<uint64>(DeriveRegionSeed(HexCoord));
	uint64 H = CombineHash(RegionSeed, static_cast<uint64>(CellX));
	H = CombineHash(H, static_cast<uint64>(CellY));
	H = CombineHash(H, static_cast<uint64>(SeedKey.ContentVersion));
	return static_cast<int64>(H);
}

FGeneratedDescriptorId UHexWorldSeedSubsystem::DeriveDescriptorId(
	const FHexCoord& HexCoord,
	FName ArchetypeId,
	int32 LocalIndex) const
{
	// Hash(WorldSeed, HexQ, HexR, ArchetypeId, LocalIndex, ContentVersion)
	uint64 H = CombineHash(static_cast<uint64>(SeedKey.WorldSeed), static_cast<uint64>(HexCoord.Q));
	H = CombineHash(H, static_cast<uint64>(HexCoord.R));
	H = CombineHash(H, static_cast<uint64>(ArchetypeId.GetComparisonIndex().ToUnstableInt()));
	H = CombineHash(H, static_cast<uint64>(LocalIndex));
	H = CombineHash(H, static_cast<uint64>(SeedKey.ContentVersion));

	FGeneratedDescriptorId Id;
	Id.Hash = static_cast<int64>(H);
	return Id;
}

FRandomStream UHexWorldSeedSubsystem::CreateRegionStream(const FHexCoord& Coord) const
{
	const int64 RegionSeed = DeriveRegionSeed(Coord);
	return FRandomStream(static_cast<int32>(RegionSeed & 0x7FFFFFFF));
}

// --- Hash Utility ------------------------------------------------

uint64 UHexWorldSeedSubsystem::CombineHash(uint64 A, uint64 B)
{
	// Explicit arithmetic mixing -- platform-stable, no dependency on GetTypeHash.
	// Based on splitmix64-style mixing for avalanche properties.
	A ^= B + 0x9E3779B97F4A7C15ULL + (A << 6) + (A >> 2);
	A ^= A >> 30;
	A *= 0xBF58476D1CE4E5B9ULL;
	A ^= A >> 27;
	A *= 0x94D049BB133111EBULL;
	A ^= A >> 31;
	return A;
}
