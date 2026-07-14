#include "HexNoiseSubsystem.h"
#include "KBVEWorldNoise.h"

void UHexNoiseSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
}

void UHexNoiseSubsystem::Deinitialize()
{
	Super::Deinitialize();
}

float UHexNoiseSubsystem::SampleNoise2D(float X, float Y, int64 Seed, const FKBVENoiseSettings& Settings) const
{
	return FKBVEWorldNoise::Sample2D(X, Y, Seed, Settings);
}

float UHexNoiseSubsystem::SampleNoise2DNormalized(float X, float Y, int64 Seed, const FKBVENoiseSettings& Settings) const
{
	return FKBVEWorldNoise::Sample2DNormalized(X, Y, Seed, Settings);
}

TArray<float> UHexNoiseSubsystem::GenerateHeightmap(
	const FVector2D& Origin,
	int32 Resolution,
	float CellSize,
	int64 Seed,
	const FKBVENoiseSettings& Settings) const
{
	return FKBVEWorldNoise::GenerateHeightmap(Origin, Resolution, CellSize, Seed, Settings);
}

FKBVENoiseSettings UHexNoiseSubsystem::GetDefaultNoiseForBiome(EHexBiomeType Biome)
{
	FKBVENoiseSettings S;

	switch (Biome)
	{
	case EHexBiomeType::Plains:
		S.NoiseType = EKBVENoiseType::OpenSimplex2;
		S.FractalType = EKBVEFractalType::FBm;
		S.Frequency = 0.00015f;
		S.Octaves = 4;
		S.Gain = 0.4f;
		S.Lacunarity = 2.0f;
		S.Amplitude = 800.0f;
		break;

	case EHexBiomeType::Forest:
		S.NoiseType = EKBVENoiseType::OpenSimplex2;
		S.FractalType = EKBVEFractalType::FBm;
		S.Frequency = 0.0003f;
		S.Octaves = 5;
		S.Gain = 0.45f;
		S.Lacunarity = 2.0f;
		S.Amplitude = 1500.0f;
		break;

	case EHexBiomeType::Swamp:
		S.NoiseType = EKBVENoiseType::OpenSimplex2;
		S.FractalType = EKBVEFractalType::FBm;
		S.Frequency = 0.0004f;
		S.Octaves = 3;
		S.Gain = 0.3f;
		S.Amplitude = 300.0f;
		break;

	case EHexBiomeType::Mountain:
		S.NoiseType = EKBVENoiseType::OpenSimplex2;
		S.FractalType = EKBVEFractalType::Ridged;
		S.Frequency = 0.0002f;
		S.Octaves = 6;
		S.Gain = 0.5f;
		S.Lacunarity = 2.2f;
		S.Amplitude = 8000.0f;
		break;

	case EHexBiomeType::Desert:
		S.NoiseType = EKBVENoiseType::OpenSimplex2;
		S.FractalType = EKBVEFractalType::FBm;
		S.Frequency = 0.0001f;
		S.Octaves = 3;
		S.Gain = 0.35f;
		S.Amplitude = 600.0f;
		break;

	case EHexBiomeType::Coastal:
		S.NoiseType = EKBVENoiseType::OpenSimplex2;
		S.FractalType = EKBVEFractalType::FBm;
		S.Frequency = 0.0003f;
		S.Octaves = 4;
		S.Gain = 0.4f;
		S.Amplitude = 500.0f;
		break;

	case EHexBiomeType::Underground:
		S.NoiseType = EKBVENoiseType::Cellular;
		S.FractalType = EKBVEFractalType::None;
		S.Frequency = 0.0005f;
		S.Octaves = 1;
		S.Amplitude = 4000.0f;
		break;

	case EHexBiomeType::Ruins:
		S.NoiseType = EKBVENoiseType::Value;
		S.FractalType = EKBVEFractalType::FBm;
		S.Frequency = 0.0003f;
		S.Octaves = 4;
		S.Gain = 0.4f;
		S.Amplitude = 1200.0f;
		break;

	default:
		break;
	}

	return S;
}
