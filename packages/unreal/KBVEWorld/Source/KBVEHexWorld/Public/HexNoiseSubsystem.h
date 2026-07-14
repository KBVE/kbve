#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVEHexWorldTypes.h"
#include "KBVEWorldNoiseTypes.h"
#include "HexNoiseSubsystem.generated.h"

UCLASS()
class KBVEHEXWORLD_API UHexNoiseSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/**
	 * Sample noise at a world position for a given hex.
	 * Uses the hex's region seed for deterministic results.
	 */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Noise")
	float SampleNoise2D(float X, float Y, int64 Seed, const FKBVENoiseSettings& Settings) const;

	/** Sample noise and return a value remapped to [0, 1]. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Noise")
	float SampleNoise2DNormalized(float X, float Y, int64 Seed, const FKBVENoiseSettings& Settings) const;

	/** Generate a heightmap grid for a hex region. Returns row-major float array. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Noise")
	TArray<float> GenerateHeightmap(
		const FVector2D& Origin,
		int32 Resolution,
		float CellSize,
		int64 Seed,
		const FKBVENoiseSettings& Settings
	) const;

	/** Get default noise settings tuned for a biome. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Noise")
	static FKBVENoiseSettings GetDefaultNoiseForBiome(EHexBiomeType Biome);
};
