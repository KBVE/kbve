#include "KBVEWorldHeightfield.h"

#include "Async/ParallelFor.h"

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

	float SmoothStep01(float Edge0, float Edge1, float X)
	{
		const float T = FMath::Clamp((X - Edge0) / (Edge1 - Edge0), 0.0f, 1.0f);
		return T * T * (3.0f - 2.0f * T);
	}

	/**
	 * The four noise fields the world is made of, built once.
	 *
	 * Every sample needs all four now that the river gates on elevation, and
	 * constructing them per sample is what makes the naive form of this the
	 * dominant cost of generating a patch.
	 */
	struct FHeightNoiseField
	{
		FastNoiseLite Continent;
		FastNoiseLite Detail;
		FastNoiseLite Warp;
		FastNoiseLite Channel;
		const FKBVEWorldHeightfieldParams& P;

		FHeightNoiseField(const FKBVEWorldHeightfieldParams& InParams, int32 Seed)
			: Continent(BuildFbm(Seed, InParams.ContinentFreq, InParams.ContinentOctaves,
				InParams.ContinentGain, InParams.ContinentLacunarity))
			, Detail(BuildFbm(Seed + InParams.DetailSeedOffset, InParams.DetailFreq,
				InParams.DetailOctaves, InParams.DetailGain, InParams.DetailLacunarity))
			, Warp(BuildFbm(Seed + InParams.RiverWarpSeedOffset, InParams.RiverWarpFreq,
				InParams.RiverWarpOctaves, InParams.RiverGain, InParams.RiverLacunarity))
			, Channel(BuildFbm(Seed + InParams.RiverSeedOffset, InParams.RiverFreq,
				InParams.RiverOctaves, InParams.RiverGain, InParams.RiverLacunarity))
			, P(InParams)
		{
		}

		float BaseHeight(float TileX, float TileY) const
		{
			const float Mix = P.ContinentWeight * Continent.GetNoise(TileX, TileY)
				+ P.DetailWeight * Detail.GetNoise(TileX, TileY);
			return FMath::Clamp(Mix, -1.0f, 1.0f) * P.Amplitude;
		}

		float ChannelAt(float TileX, float TileY) const
		{
			const float Wx = TileX + P.RiverWarpAmp * Warp.GetNoise(TileX, TileY);
			const float Wy = TileY + P.RiverWarpAmp
				* Warp.GetNoise(TileX + P.RiverWarpLobe, TileY - P.RiverWarpLobe);
			return Channel.GetNoise(Wx, Wy);
		}

		/**
		 * Saturating a gaussian rather than using it raw is what gives the
		 * profile a flat floor with banks either side. A plain falloff makes a V,
		 * which reads as a ditch someone dug rather than as water that has been
		 * running there.
		 */
		float RiverMask(float TileX, float TileY) const
		{
			const float N = ChannelAt(TileX, TileY);
			const float Step = P.RiverGradientStep;
			const float Gx = (ChannelAt(TileX + Step, TileY) - N) / Step;
			const float Gy = (ChannelAt(TileX, TileY + Step) - N) / Step;
			const float Gradient = FMath::Max(FMath::Sqrt(Gx * Gx + Gy * Gy), 1.0e-6f);

			const float Distance = FMath::Abs(N) / Gradient;
			const float Width = P.RiverWidthTiles;
			const float Falloff = FMath::Exp(-(Distance * Distance) / (2.0f * Width * Width));

			const float Above = BaseHeight(TileX, TileY) - P.WaterZ;
			const float Gate = 1.0f - SmoothStep01(P.RiverMaxElevation * 0.6f,
				P.RiverMaxElevation, Above);

			return FMath::Clamp(Falloff * 1.15f, 0.0f, 1.0f) * Gate;
		}

		/**
		 * Lerps toward an absolute bed rather than subtracting a depth.
		 * Subtracting carries the terrain's own detail down with it, so the river
		 * floor keeps the bumps of the hillside it cut through and the channel
		 * reads as a string of holes rather than as one continuous bed.
		 */
		float Height(float TileX, float TileY) const
		{
			const float H = BaseHeight(TileX, TileY);
			const float Bed = P.WaterZ - P.RiverbedDepth;
			return H + (Bed - H) * RiverMask(TileX, TileY);
		}
	};
}

float FKBVEWorldHeightfield::HeightAt(int32 Seed, float TileX, float TileY)
{
	return HeightAt(FKBVEWorldHeightfieldParams(), Seed, TileX, TileY);
}

float FKBVEWorldHeightfield::RiverMaskAt(int32 Seed, float TileX, float TileY)
{
	return RiverMaskAt(FKBVEWorldHeightfieldParams(), Seed, TileX, TileY);
}

float FKBVEWorldHeightfield::RiverMaskAt(const FKBVEWorldHeightfieldParams& Params,
	int32 Seed, float TileX, float TileY)
{
	return FHeightNoiseField(Params, Seed).RiverMask(TileX, TileY);
}

float FKBVEWorldHeightfield::HeightAt(const FKBVEWorldHeightfieldParams& Params,
	int32 Seed, float TileX, float TileY)
{
	return FHeightNoiseField(Params, Seed).Height(TileX, TileY);
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

	const FHeightNoiseField Field(Params, Seed);

	// A row at a time across the worker threads. The field is sampled and never
	// written, the rows it writes into do not overlap, and the noise carries no
	// state between samples -- so the only thing serialising this was the loop.
	//
	// Below the threshold it stays on one thread: the outer rings are a few
	// hundred samples, and dispatching those costs more than computing them.
	const bool bParallel = Edge >= 64;
	float* const OutData = Out.GetData();

	ParallelFor(Edge, [&Field, OutData, OriginTileX, OriginTileY, TileStep, Edge](int32 Y)
	{
		const float TileY = OriginTileY + Y * TileStep;
		float* Row = OutData + Y * Edge;
		for (int32 X = 0; X < Edge; ++X)
		{
			const float TileX = OriginTileX + X * TileStep;
			Row[X] = Field.Height(TileX, TileY);
		}
	}, bParallel ? EParallelForFlags::None : EParallelForFlags::ForceSingleThread);
}
