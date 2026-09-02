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

	/** Canonical i64 world seed -> i32 noise seed truncation. */
	static int32 SeedFromWorld(int64 WorldSeed)
	{
		return static_cast<int32>(static_cast<uint32>(WorldSeed & 0xFFFFFFFF));
	}

	static float HeightAt(int32 Seed, float TileX, float TileY);

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
