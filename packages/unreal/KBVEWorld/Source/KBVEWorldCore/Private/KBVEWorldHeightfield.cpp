#include "KBVEWorldHeightfield.h"

THIRD_PARTY_INCLUDES_START
#include "FastNoiseLite.h"
THIRD_PARTY_INCLUDES_END

namespace
{
	FastNoiseLite BuildFbm(int32 Seed, float Frequency, int32 Octaves, float Gain, float Lacunarity)
	{
		FastNoiseLite Noise;
		Noise.SetSeed(Seed);
		Noise.SetNoiseType(FastNoiseLite::NoiseType_OpenSimplex2);
		Noise.SetFractalType(FastNoiseLite::FractalType_FBm);
		Noise.SetFrequency(Frequency);
		Noise.SetFractalOctaves(Octaves);
		Noise.SetFractalGain(Gain);
		Noise.SetFractalLacunarity(Lacunarity);
		return Noise;
	}
}

float FKBVEWorldHeightfield::HeightAt(int32 Seed, float TileX, float TileY)
{
	return HeightAt(FKBVEWorldHeightfieldParams(), Seed, TileX, TileY);
}

float FKBVEWorldHeightfield::HeightAt(const FKBVEWorldHeightfieldParams& Params,
	int32 Seed, float TileX, float TileY)
{
	const FastNoiseLite Continent = BuildFbm(Seed, Params.ContinentFreq, Params.ContinentOctaves,
		Params.ContinentGain, Params.ContinentLacunarity);
	const FastNoiseLite Detail = BuildFbm(Seed + Params.DetailSeedOffset, Params.DetailFreq,
		Params.DetailOctaves, Params.DetailGain, Params.DetailLacunarity);
	const float Mix = Params.ContinentWeight * Continent.GetNoise(TileX, TileY)
		+ Params.DetailWeight * Detail.GetNoise(TileX, TileY);
	return FMath::Clamp(Mix, -1.0f, 1.0f) * Params.Amplitude;
}

void FKBVEWorldHeightfield::FillGrid(int32 Seed, float OriginTileX, float OriginTileY,
	float TileStep, int32 Edge, TArrayView<float> Out)
{
	FillGrid(FKBVEWorldHeightfieldParams(), Seed, OriginTileX, OriginTileY, TileStep, Edge, Out);
}

void FKBVEWorldHeightfield::FillGrid(const FKBVEWorldHeightfieldParams& Params, int32 Seed,
	float OriginTileX, float OriginTileY, float TileStep, int32 Edge, TArrayView<float> Out)
{
	check(Out.Num() >= Edge * Edge);

	const FastNoiseLite Continent = BuildFbm(Seed, Params.ContinentFreq, Params.ContinentOctaves,
		Params.ContinentGain, Params.ContinentLacunarity);
	const FastNoiseLite Detail = BuildFbm(Seed + Params.DetailSeedOffset, Params.DetailFreq,
		Params.DetailOctaves, Params.DetailGain, Params.DetailLacunarity);

	for (int32 Y = 0; Y < Edge; ++Y)
	{
		const float TileY = OriginTileY + Y * TileStep;
		for (int32 X = 0; X < Edge; ++X)
		{
			const float TileX = OriginTileX + X * TileStep;
			const float Mix = Params.ContinentWeight * Continent.GetNoise(TileX, TileY)
				+ Params.DetailWeight * Detail.GetNoise(TileX, TileY);
			Out[Y * Edge + X] = FMath::Clamp(Mix, -1.0f, 1.0f) * Params.Amplitude;
		}
	}
}
