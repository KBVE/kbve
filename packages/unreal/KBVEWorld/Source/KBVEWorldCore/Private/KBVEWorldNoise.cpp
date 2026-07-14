#include "KBVEWorldNoise.h"

THIRD_PARTY_INCLUDES_START
#include "FastNoiseLite.h"
THIRD_PARTY_INCLUDES_END

namespace
{
	FastNoiseLite BuildNoise(int64 Seed, const FKBVENoiseSettings& Settings)
	{
		FastNoiseLite Noise;
		Noise.SetSeed(static_cast<int>(Seed & 0x7FFFFFFF));

		switch (Settings.NoiseType)
		{
		case EKBVENoiseType::OpenSimplex2: Noise.SetNoiseType(FastNoiseLite::NoiseType_OpenSimplex2); break;
		case EKBVENoiseType::Perlin:       Noise.SetNoiseType(FastNoiseLite::NoiseType_Perlin); break;
		case EKBVENoiseType::Cellular:     Noise.SetNoiseType(FastNoiseLite::NoiseType_Cellular); break;
		case EKBVENoiseType::Value:        Noise.SetNoiseType(FastNoiseLite::NoiseType_Value); break;
		}

		switch (Settings.FractalType)
		{
		case EKBVEFractalType::None:     Noise.SetFractalType(FastNoiseLite::FractalType_None); break;
		case EKBVEFractalType::FBm:      Noise.SetFractalType(FastNoiseLite::FractalType_FBm); break;
		case EKBVEFractalType::Ridged:   Noise.SetFractalType(FastNoiseLite::FractalType_Ridged); break;
		case EKBVEFractalType::PingPong: Noise.SetFractalType(FastNoiseLite::FractalType_PingPong); break;
		}

		Noise.SetFrequency(Settings.Frequency);
		Noise.SetFractalOctaves(Settings.Octaves);
		Noise.SetFractalLacunarity(Settings.Lacunarity);
		Noise.SetFractalGain(Settings.Gain);

		return Noise;
	}
}

float FKBVEWorldNoise::Sample2D(float X, float Y, int64 Seed, const FKBVENoiseSettings& Settings)
{
	const FastNoiseLite Noise = BuildNoise(Seed, Settings);
	return Noise.GetNoise(X, Y) * Settings.Amplitude;
}

float FKBVEWorldNoise::Sample2DNormalized(float X, float Y, int64 Seed, const FKBVENoiseSettings& Settings)
{
	const FastNoiseLite Noise = BuildNoise(Seed, Settings);
	return (Noise.GetNoise(X, Y) + 1.0f) * 0.5f;
}

void FKBVEWorldNoise::GenerateHeightmap(
	TArray<float>& Out,
	const FVector2D& Origin,
	int32 Resolution,
	float CellSize,
	int64 Seed,
	const FKBVENoiseSettings& Settings)
{
	Out.SetNumUninitialized(Resolution * Resolution);

	const FastNoiseLite Noise = BuildNoise(Seed, Settings);

	for (int32 Y = 0; Y < Resolution; ++Y)
	{
		for (int32 X = 0; X < Resolution; ++X)
		{
			const float WorldX = Origin.X + X * CellSize;
			const float WorldY = Origin.Y + Y * CellSize;
			Out[Y * Resolution + X] = Noise.GetNoise(WorldX, WorldY) * Settings.Amplitude;
		}
	}
}

TArray<float> FKBVEWorldNoise::GenerateHeightmap(
	const FVector2D& Origin,
	int32 Resolution,
	float CellSize,
	int64 Seed,
	const FKBVENoiseSettings& Settings)
{
	TArray<float> Out;
	GenerateHeightmap(Out, Origin, Resolution, CellSize, Seed, Settings);
	return Out;
}
