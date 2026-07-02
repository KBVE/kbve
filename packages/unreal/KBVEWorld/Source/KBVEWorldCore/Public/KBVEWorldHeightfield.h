#pragma once

#include "CoreMinimal.h"

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
};
