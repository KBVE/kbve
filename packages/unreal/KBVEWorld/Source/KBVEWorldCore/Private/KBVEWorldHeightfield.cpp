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
	const FastNoiseLite Continent = BuildFbm(Seed, ContinentFreq, ContinentOctaves, ContinentGain, ContinentLacunarity);
	const FastNoiseLite Detail = BuildFbm(Seed + DetailSeedOffset, DetailFreq, DetailOctaves, DetailGain, DetailLacunarity);
	const float Mix = ContinentWeight * Continent.GetNoise(TileX, TileY) + DetailWeight * Detail.GetNoise(TileX, TileY);
	return FMath::Clamp(Mix, -1.0f, 1.0f) * Amplitude;
}
