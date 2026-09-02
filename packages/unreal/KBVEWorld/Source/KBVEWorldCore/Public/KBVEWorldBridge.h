#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldHeightfieldParams.h"
#include "KBVEWorldRibbon.h"
#include "KBVEWorldRoadField.h"
#include "KBVEWorldRoadGraph.h"

#include "KBVEWorldBridge.generated.h"

/**
 * Shape of a bridge.
 *
 * A bridge is never placed: it is what a road does where it has to cross its own
 * river, and its two ends are samples of the road polyline rather than anchors
 * of their own. That is what makes the join seamless -- there is no second
 * opinion about where the road was.
 *
 * Its ends are read off the graded ground, not the raw heightfield. The road is
 * terrain now, levelled to a smoothed profile, so a deck that met the raw
 * surface would meet it at a height the road no longer has -- a step at both
 * abutments, on every crossing.
 */
USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldBridgeParams
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Deck", meta = (ClampMin = "1.0"))
	float DeckWidth = 560.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Deck", meta = (ClampMin = "1.0"))
	float DeckThickness = 44.0f;

	/**
	 * Rise at midspan, before clearance is taken into account.
	 *
	 * Cosmetic in shape but not in function: a dead flat deck between two banks
	 * of unequal height reads as a plank dropped across a ditch, and its
	 * underside ends up in the water on the low side.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Deck", meta = (ClampMin = "0.0"))
	float ArchHeight = 70.0f;

	/**
	 * Hard ceiling on the rise.
	 *
	 * The clearance solve divides by the taper carrying the arch, so a sample
	 * near either end -- where the taper is small and the ground is the bank the
	 * deck is landing on -- can demand an arbitrarily large rise for a crossing
	 * that needs none. The divide is bounded now, and this is the backstop.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Deck", meta = (ClampMin = "0.0"))
	float MaxArchHeight = 260.0f;

	/**
	 * Water the deck must clear.
	 *
	 * The arch is raised until this holds rather than being trusted as given: a
	 * fixed rise clears a deep channel and grazes a shallow one, and a deck that
	 * grazes has nowhere to put a pier -- every support comes out shorter than it
	 * is worth building, and the crossing renders as a plank lying in a ditch.
	 *
	 * Demanded over the channel only, not over the whole span. The margins either
	 * side are approach, where the deck is meant to be coming down to meet the
	 * road; asking it to clear the banks it lands on is what made every bridge
	 * arch far higher than its crossing needed.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Deck", meta = (ClampMin = "0.0"))
	float MinClearance = 190.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Deck", meta = (ClampMin = "1.0"))
	float TileLength = 520.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Rail", meta = (ClampMin = "0.0"))
	float RailHeight = 115.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Rail", meta = (ClampMin = "1.0"))
	float RailThickness = 26.0f;

	/** How far in from the deck edge the rails sit. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Rail", meta = (ClampMin = "0.0"))
	float RailInset = 34.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Pier", meta = (ClampMin = "1.0"))
	float PierSpacing = 900.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Pier", meta = (ClampMin = "1.0"))
	float PierWidth = 170.0f;

	/** How far a pier is sunk into the ground it lands on, so none of them float. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Pier", meta = (ClampMin = "0.0"))
	float PierEmbed = 140.0f;

	/** Piers shorter than this are not built; the deck is already on the ground. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Pier", meta = (ClampMin = "0.0"))
	float MinPierHeight = 90.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Pier", meta = (ClampMin = "1.0"))
	float AbutmentWidth = 300.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Bridge|Pier", meta = (ClampMin = "1.0"))
	float StoneTileLength = 400.0f;
};

struct KBVEWORLDCORE_API FKBVEWorldBridge
{
	/**
	 * Build one crossing from the road polyline and the span that is over water.
	 *
	 * Wood and stone come back as separate meshes because they are separate
	 * materials, and a material change inside one procedural mesh section is not
	 * a thing -- two sections is the cheapest form of the split.
	 */
	static void Build(const FKBVEWorldBridgeParams& Bridge, const FKBVEWorldRoadParams& Road,
		const FKBVEWorldHeightfieldParams& Shape, int32 Seed, const FKBVEWorldRoadField* Field,
		const TArray<FVector>& Path, const FKBVEWorldRoadSpan& Span,
		FKBVEWorldRibbonMesh& OutWood, FKBVEWorldRibbonMesh& OutStone);
};
