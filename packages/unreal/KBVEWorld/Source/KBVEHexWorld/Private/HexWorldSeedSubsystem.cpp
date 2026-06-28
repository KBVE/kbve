#include "HexWorldSeedSubsystem.h"
#include "KBVEWorldSeed.h"

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
	return FKBVEWorldSeed::DeriveSeed(SeedKey.WorldSeed, { Coord.Q, Coord.R, SeedKey.ContentVersion });
}

int64 UHexWorldSeedSubsystem::DeriveCellSeed(const FHexCoord& HexCoord, int32 CellX, int32 CellY) const
{
	// Hash(RegionSeed, CellX, CellY, ContentVersion)
	const int64 RegionSeed = DeriveRegionSeed(HexCoord);
	return FKBVEWorldSeed::DeriveSeed(RegionSeed, { CellX, CellY, SeedKey.ContentVersion });
}

FGeneratedDescriptorId UHexWorldSeedSubsystem::DeriveDescriptorId(
	const FHexCoord& HexCoord,
	FName ArchetypeId,
	int32 LocalIndex) const
{
	// Hash(WorldSeed, HexQ, HexR, ArchetypeId, LocalIndex, ContentVersion)
	const int64 H = FKBVEWorldSeed::DeriveSeed(SeedKey.WorldSeed, {
		HexCoord.Q,
		HexCoord.R,
		static_cast<int64>(ArchetypeId.GetComparisonIndex().ToUnstableInt()),
		LocalIndex,
		SeedKey.ContentVersion
	});

	FGeneratedDescriptorId Id;
	Id.Hash = H;
	return Id;
}

FRandomStream UHexWorldSeedSubsystem::CreateRegionStream(const FHexCoord& Coord) const
{
	return FKBVEWorldSeed::MakeStream(DeriveRegionSeed(Coord));
}
