#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldHeightfieldParams.h"

/**
 * Canonical shared heightmap: height as a pure function of (seed, tile) so the
 * simgrid server, web client, and Unreal client derive the identical terrain.
 * Mirrored in packages/rust/simgrid (height_at) and @kbve/laser (heightAt) over
 * FastNoiseLite 1.1.1; parity is pinned by cross-language test vectors. Domain
 * is TILE coordinates (world uu / 100); output is height in Unreal uu.
 */
struct KBVEWORLDCORE_API FKBVEWorldHeightfield
{
	static constexpr float ContinentFreq = 0.01f;
	static constexpr int32 ContinentOctaves = 5;
	static constexpr float ContinentGain = 0.5f;
	static constexpr float ContinentLacunarity = 2.05f;

	static constexpr float DetailFreq = 0.08f;
	static constexpr int32 DetailOctaves = 3;
	static constexpr float DetailGain = 0.45f;
	static constexpr float DetailLacunarity = 2.10f;
	static constexpr int32 DetailSeedOffset = 1024;

	static constexpr float ContinentWeight = 0.78f;
	static constexpr float DetailWeight = 0.22f;
	static constexpr float Amplitude = 900.0f;

	static constexpr float RiverFreq = 0.001f;
	static constexpr int32 RiverOctaves = 2;
	static constexpr float RiverGain = 0.5f;
	static constexpr float RiverLacunarity = 2.0f;
	static constexpr int32 RiverSeedOffset = 7717;

	static constexpr float RiverWarpFreq = 0.006f;
	static constexpr int32 RiverWarpOctaves = 2;
	static constexpr float RiverWarpAmp = 45.0f;
	static constexpr int32 RiverWarpSeedOffset = 91237;
	static constexpr float RiverWarpLobe = 137.0f;

	static constexpr float RiverWidthTiles = 7.0f;
	static constexpr float RiverGradientStep = 2.0f;
	static constexpr float WaterZ = -140.0f;
	static constexpr float RiverbedDepth = 160.0f;
	static constexpr float RiverMaxElevation = 260.0f;

	/** Canonical i64 world seed -> i32 noise seed truncation. */
	static int32 SeedFromWorld(int64 WorldSeed)
	{
		return static_cast<int32>(static_cast<uint32>(WorldSeed & 0xFFFFFFFF));
	}

	static float HeightAt(int32 Seed, float TileX, float TileY);

	/**
	 * Strength of the river channel at a tile, 0 outside the banks to 1 on the
	 * centre line.
	 *
	 * The carve this drives lives inside HeightAt rather than beside it: a
	 * riverbed only the renderer knows about is ground the server still calls
	 * solid, and the two then disagree about where a pawn stands. Roads cost
	 * against this mask and bridges span the run where a road crosses it anyway,
	 * so both read the field the ground was cut with instead of guessing at it a
	 * second time.
	 */
	static float RiverMaskAt(int32 Seed, float TileX, float TileY);

	static float RiverMaskAt(const FKBVEWorldHeightfieldParams& Params, int32 Seed,
		float TileX, float TileY);

	/** As above, with the shape supplied rather than taken from the constants. */
	static float HeightAt(const FKBVEWorldHeightfieldParams& Params, int32 Seed, float TileX, float TileY);

	/**
	 * Fill an Edge x Edge grid of heights in row-major order, rows advancing in Y.
	 *
	 * Identical results to calling HeightAt per sample, but the two noise
	 * generators are built once for the whole grid rather than once per sample --
	 * which is what HeightAt does, and what makes it the wrong call in a loop
	 * over tens of thousands of vertices.
	 */
	static void FillGrid(int32 Seed, float OriginTileX, float OriginTileY, float TileStep,
		int32 Edge, TArrayView<float> Out);

	/** As above, with the shape supplied rather than taken from the constants. */
	static void FillGrid(const FKBVEWorldHeightfieldParams& Params, int32 Seed,
		float OriginTileX, float OriginTileY, float TileStep, int32 Edge, TArrayView<float> Out);
};
