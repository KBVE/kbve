#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVEHexWorldTypes.h"
#include "HexWorldSeedSubsystem.generated.h"

UCLASS()
class KBVEHEXWORLD_API UHexWorldSeedSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// --- Seed Configuration --------------------------------------

	/** Set the global world seed. Should be called once at world creation. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Seed")
	void SetWorldSeed(const FWorldSeedKey& InSeedKey);

	UFUNCTION(BlueprintPure, Category = "HexWorld|Seed")
	FWorldSeedKey GetWorldSeedKey() const { return SeedKey; }

	// --- Deterministic Derivation --------------------------------

	/** Derive a region seed for a hex coordinate. Deterministic. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Seed")
	int64 DeriveRegionSeed(const FHexCoord& Coord) const;

	/** Derive a cell seed within a region. Deterministic. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Seed")
	int64 DeriveCellSeed(const FHexCoord& HexCoord, int32 CellX, int32 CellY) const;

	/**
	 * Derive a stable descriptor ID for a generated object.
	 * Hash(WorldSeed, HexQ, HexR, ArchetypeId, LocalIndex, ContentVersion)
	 */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Seed")
	FGeneratedDescriptorId DeriveDescriptorId(
		const FHexCoord& HexCoord,
		FName ArchetypeId,
		int32 LocalIndex
	) const;

	/** Create an FRandomStream seeded from a region seed. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Seed")
	FRandomStream CreateRegionStream(const FHexCoord& Coord) const;

private:
	/** Platform-stable hash combine. Uses explicit arithmetic, not GetTypeHash. */
	static uint64 CombineHash(uint64 A, uint64 B);

	UPROPERTY()
	FWorldSeedKey SeedKey;
};
