#pragma once

#include "CoreMinimal.h"

#include "KBVEWorldHeightfieldParams.generated.h"

/**
 * Tunable form of the heightfield's shape.
 *
 * Every default here is the canonical constant from FKBVEWorldHeightfield, so a
 * default-constructed instance reproduces the pinned cross-language vectors
 * exactly. Changing one makes the terrain diverge from what the simgrid server
 * and the web client derive for the same seed -- which is fine for finding the
 * look, and is why these are exposed, but the found values belong back in the
 * canonical constants with the vectors regenerated, not left set on an actor.
 */
USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldHeightfieldParams
{
	GENERATED_BODY()

	/** Broad landmass shape. Lower frequency is larger, slower features. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Continent")
	float ContinentFreq = 0.01f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Continent", meta = (ClampMin = "1", ClampMax = "10"))
	int32 ContinentOctaves = 5;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Continent")
	float ContinentGain = 0.5f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Continent")
	float ContinentLacunarity = 2.05f;

	/**
	 * Fine surface variation. At the canonical 0.08 a feature repeats about
	 * every 12 tiles, so this -- not Amplitude -- is what makes ground read as
	 * busy underfoot. Lower it for smoother terrain before touching Amplitude.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Detail")
	float DetailFreq = 0.08f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Detail", meta = (ClampMin = "1", ClampMax = "10"))
	int32 DetailOctaves = 3;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Detail")
	float DetailGain = 0.45f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Detail")
	float DetailLacunarity = 2.10f;

	/** Keeps the detail layer decorrelated from the continent layer. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Detail")
	int32 DetailSeedOffset = 1024;

	/** How much of the final height each layer contributes. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mix", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float ContinentWeight = 0.78f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mix", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float DetailWeight = 0.22f;

	/** Peak height in world units. The mixed noise is clamped to +/-1 first. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mix")
	float Amplitude = 900.0f;

	/** How large the river network is. Lower is fewer, further-apart rivers. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River")
	float RiverFreq = 0.001f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River", meta = (ClampMin = "1", ClampMax = "8"))
	int32 RiverOctaves = 2;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River")
	float RiverGain = 0.5f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River")
	float RiverLacunarity = 2.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River")
	int32 RiverSeedOffset = 7717;

	/**
	 * Warp pulls the channel off the noise's own grid. Without it rivers run as
	 * soft diagonals; with it they meander.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River|Warp")
	float RiverWarpFreq = 0.006f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River|Warp", meta = (ClampMin = "1", ClampMax = "8"))
	int32 RiverWarpOctaves = 2;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River|Warp")
	float RiverWarpAmp = 45.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River|Warp")
	int32 RiverWarpSeedOffset = 91237;

	/** Offset of the second warp sample, so x and y come from one field undistorted. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River|Warp")
	float RiverWarpLobe = 137.0f;

	/**
	 * Half-width of the channel in TILES, not in noise units.
	 *
	 * That distinction is the difference between a river and a chain of ponds. A
	 * band of constant noise value is wide wherever the field is flat and pinched
	 * wherever it is steep, so its width on the ground varies by an order of
	 * magnitude along one channel. Dividing by the gradient turns the value back
	 * into a distance, and the channel then holds its width.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River", meta = (ClampMin = "0.5"))
	float RiverWidthTiles = 7.0f;

	/**
	 * Step used to measure the noise gradient, in tiles. Wide on purpose: the
	 * gradient is a difference of two nearly equal values, so a short step is
	 * dominated by cancellation, and the error lands straight on the river width.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River", meta = (ClampMin = "0.1"))
	float RiverGradientStep = 2.0f;

	/** Surface every body of standing water sits at. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River")
	float WaterZ = -140.0f;

	/** How far the channel floor lies below the water surface. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River", meta = (ClampMin = "0.0"))
	float RiverbedDepth = 160.0f;

	/**
	 * How high above the water rivers still run.
	 *
	 * The water surface is one flat plane, so a channel carved across a hilltop
	 * is a dry trench rather than a river. Fading the carve out with elevation is
	 * what keeps every channel that does exist full: rivers belong to the
	 * lowlands here, and the uplands they would drain are left alone.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "River", meta = (ClampMin = "0.0"))
	float RiverMaxElevation = 260.0f;
};