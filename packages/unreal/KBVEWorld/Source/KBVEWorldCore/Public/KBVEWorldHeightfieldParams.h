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
};
