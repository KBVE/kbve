#include "HexNoiseSubsystem.h"

THIRD_PARTY_INCLUDES_START
#include "FastNoiseLite.h"
THIRD_PARTY_INCLUDES_END

namespace
{
	FastNoiseLite CreateNoise(int64 Seed, const FHexNoiseSettings& Settings)
	{
		FastNoiseLite Noise;
		Noise.SetSeed(static_cast<int>(Seed & 0x7FFFFFFF));

		switch (Settings.NoiseType)
		{
		case EHexNoiseType::OpenSimplex2: Noise.SetNoiseType(FastNoiseLite::NoiseType_OpenSimplex2); break;
		case EHexNoiseType::Perlin:       Noise.SetNoiseType(FastNoiseLite::NoiseType_Perlin); break;
		case EHexNoiseType::Cellular:     Noise.SetNoiseType(FastNoiseLite::NoiseType_Cellular); break;
		case EHexNoiseType::Value:        Noise.SetNoiseType(FastNoiseLite::NoiseType_Value); break;
		}

		switch (Settings.FractalType)
		{
		case EHexFractalType::None:     Noise.SetFractalType(FastNoiseLite::FractalType_None); break;
		case EHexFractalType::FBm:      Noise.SetFractalType(FastNoiseLite::FractalType_FBm); break;
		case EHexFractalType::Ridged:   Noise.SetFractalType(FastNoiseLite::FractalType_Ridged); break;
		case EHexFractalType::PingPong: Noise.SetFractalType(FastNoiseLite::FractalType_PingPong); break;
		}

		Noise.SetFrequency(Settings.Frequency);
		Noise.SetFractalOctaves(Settings.Octaves);
		Noise.SetFractalLacunarity(Settings.Lacunarity);
		Noise.SetFractalGain(Settings.Gain);

		return Noise;
	}
}

void UHexNoiseSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
}

void UHexNoiseSubsystem::Deinitialize()
{
	Super::Deinitialize();
}

float UHexNoiseSubsystem::SampleNoise2D(float X, float Y, int64 Seed, const FHexNoiseSettings& Settings) const
{
	FastNoiseLite Noise = CreateNoise(Seed, Settings);
	return Noise.GetNoise(X, Y) * Settings.Amplitude;
}

float UHexNoiseSubsystem::SampleNoise2DNormalized(float X, float Y, int64 Seed, const FHexNoiseSettings& Settings) const
{
	FastNoiseLite Noise = CreateNoise(Seed, Settings);
	// FastNoiseLite returns [-1, 1], remap to [0, 1]
	return (Noise.GetNoise(X, Y) + 1.0f) * 0.5f;
}

TArray<float> UHexNoiseSubsystem::GenerateHeightmap(
	const FVector2D& Origin,
	int32 Resolution,
	float CellSize,
	int64 Seed,
	const FHexNoiseSettings& Settings) const
{
	TArray<float> Heightmap;
	Heightmap.SetNumUninitialized(Resolution * Resolution);

	FastNoiseLite Noise = CreateNoise(Seed, Settings);

	for (int32 Y = 0; Y < Resolution; ++Y)
	{
		for (int32 X = 0; X < Resolution; ++X)
		{
			const float WorldX = Origin.X + X * CellSize;
			const float WorldY = Origin.Y + Y * CellSize;
			Heightmap[Y * Resolution + X] = Noise.GetNoise(WorldX, WorldY) * Settings.Amplitude;
		}
	}

	return Heightmap;
}

FHexNoiseSettings UHexNoiseSubsystem::GetDefaultNoiseForBiome(EHexBiomeType Biome)
{
	FHexNoiseSettings S;

	switch (Biome)
	{
	case EHexBiomeType::Plains:
		S.NoiseType = EHexNoiseType::OpenSimplex2;
		S.FractalType = EHexFractalType::FBm;
		S.Frequency = 0.00015f;
		S.Octaves = 4;
		S.Gain = 0.4f;
		S.Lacunarity = 2.0f;
		S.Amplitude = 800.0f;
		break;

	case EHexBiomeType::Forest:
		S.NoiseType = EHexNoiseType::OpenSimplex2;
		S.FractalType = EHexFractalType::FBm;
		S.Frequency = 0.0003f;
		S.Octaves = 5;
		S.Gain = 0.45f;
		S.Lacunarity = 2.0f;
		S.Amplitude = 1500.0f;
		break;

	case EHexBiomeType::Swamp:
		S.NoiseType = EHexNoiseType::OpenSimplex2;
		S.FractalType = EHexFractalType::FBm;
		S.Frequency = 0.0004f;
		S.Octaves = 3;
		S.Gain = 0.3f;
		S.Amplitude = 300.0f;
		break;

	case EHexBiomeType::Mountain:
		S.NoiseType = EHexNoiseType::OpenSimplex2;
		S.FractalType = EHexFractalType::Ridged;
		S.Frequency = 0.0002f;
		S.Octaves = 6;
		S.Gain = 0.5f;
		S.Lacunarity = 2.2f;
		S.Amplitude = 8000.0f;
		break;

	case EHexBiomeType::Desert:
		S.NoiseType = EHexNoiseType::OpenSimplex2;
		S.FractalType = EHexFractalType::FBm;
		S.Frequency = 0.0001f;
		S.Octaves = 3;
		S.Gain = 0.35f;
		S.Amplitude = 600.0f;
		break;

	case EHexBiomeType::Coastal:
		S.NoiseType = EHexNoiseType::OpenSimplex2;
		S.FractalType = EHexFractalType::FBm;
		S.Frequency = 0.0003f;
		S.Octaves = 4;
		S.Gain = 0.4f;
		S.Amplitude = 500.0f;
		break;

	case EHexBiomeType::Underground:
		S.NoiseType = EHexNoiseType::Cellular;
		S.FractalType = EHexFractalType::None;
		S.Frequency = 0.0005f;
		S.Octaves = 1;
		S.Amplitude = 4000.0f;
		break;

	case EHexBiomeType::Ruins:
		S.NoiseType = EHexNoiseType::Value;
		S.FractalType = EHexFractalType::FBm;
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
