#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVEHexWorldTypes.h"
#include "HexNoiseSubsystem.generated.h"

UENUM(BlueprintType)
enum class EHexNoiseType : uint8
{
	OpenSimplex2     UMETA(DisplayName = "OpenSimplex2"),
	Perlin           UMETA(DisplayName = "Perlin"),
	Cellular         UMETA(DisplayName = "Cellular"),
	Value            UMETA(DisplayName = "Value")
};

UENUM(BlueprintType)
enum class EHexFractalType : uint8
{
	None             UMETA(DisplayName = "None"),
	FBm              UMETA(DisplayName = "FBm"),
	Ridged           UMETA(DisplayName = "Ridged"),
	PingPong         UMETA(DisplayName = "Ping Pong")
};

USTRUCT(BlueprintType)
struct KBVEHEXWORLD_API FHexNoiseSettings
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Noise")
	EHexNoiseType NoiseType = EHexNoiseType::OpenSimplex2;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Noise")
	EHexFractalType FractalType = EHexFractalType::FBm;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Noise", meta = (ClampMin = "0.0001"))
	float Frequency = 0.005f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Noise", meta = (ClampMin = "1", ClampMax = "10"))
	int32 Octaves = 4;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Noise", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float Lacunarity = 2.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Noise", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float Gain = 0.5f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Noise")
	float Amplitude = 5000.0f;
};

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
	float SampleNoise2D(float X, float Y, int64 Seed, const FHexNoiseSettings& Settings) const;

	/** Sample noise and return a value remapped to [0, 1]. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Noise")
	float SampleNoise2DNormalized(float X, float Y, int64 Seed, const FHexNoiseSettings& Settings) const;

	/** Generate a heightmap grid for a hex region. Returns row-major float array. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Noise")
	TArray<float> GenerateHeightmap(
		const FVector2D& Origin,
		int32 Resolution,
		float CellSize,
		int64 Seed,
		const FHexNoiseSettings& Settings
	) const;

	/** Get default noise settings tuned for a biome. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Noise")
	static FHexNoiseSettings GetDefaultNoiseForBiome(EHexBiomeType Biome);
};
