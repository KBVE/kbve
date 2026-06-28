#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldNoiseTypes.h"

/**
 * Stateless noise facade over FastNoiseLite, shared by every KBVEWorld module
 * (square chunks and hex topology). Plain static C++ — no UObject overhead — so
 * inline terrain generators and Blueprint subsystems can both call it.
 */
struct KBVEWORLDCORE_API FKBVEWorldNoise
{
	/** Raw noise scaled by Amplitude. */
	static float Sample2D(float X, float Y, int64 Seed, const FKBVENoiseSettings& Settings);

	/** Noise remapped from [-1, 1] to [0, 1] (ignores Amplitude). */
	static float Sample2DNormalized(float X, float Y, int64 Seed, const FKBVENoiseSettings& Settings);

	/**
	 * Fill a row-major Resolution×Resolution heightmap. Builds the noise state
	 * once and reuses it across every sample. Out is resized to Resolution².
	 */
	static void GenerateHeightmap(
		TArray<float>& Out,
		const FVector2D& Origin,
		int32 Resolution,
		float CellSize,
		int64 Seed,
		const FKBVENoiseSettings& Settings);

	/** Allocating convenience over the out-param GenerateHeightmap. */
	static TArray<float> GenerateHeightmap(
		const FVector2D& Origin,
		int32 Resolution,
		float CellSize,
		int64 Seed,
		const FKBVENoiseSettings& Settings);
};
