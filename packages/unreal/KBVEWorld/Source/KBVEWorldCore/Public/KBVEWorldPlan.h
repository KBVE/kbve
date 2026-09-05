#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldHeightfieldParams.h"
#include "KBVEWorldRoadGraph.h"

#include "KBVEWorldPlan.generated.h"

/**
 * What has to be settled about a world before anyone is put into it.
 *
 * Everything else here streams: a chunk is built when something comes near it
 * and thrown away when nothing is. That works for all of it except the
 * questions that have to be answered before there is anywhere to be -- where
 * the player starts, and whether the seed made a world worth starting in. Those
 * cannot be answered a chunk at a time, because the answer is which chunk.
 *
 * Cheap, and deliberately so. This samples the heightfield at a few hundred
 * points and routes a handful of road edges; it is not a precomputation of the
 * world, and there is no loading screen's worth of work in it. The waiting is
 * done by the streamer afterwards, building the ground the answer points at.
 */
USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldPlanParams
{
	GENERATED_BODY()

	/** How far out to look for somewhere to start, in chunks. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Plan", meta = (ClampMin = "0"))
	int32 SearchRadiusChunks = 6;

	/**
	 * How far above the water a start has to be.
	 *
	 * Not merely dry: a spawn at the waterline is a spawn on a riverbank that the
	 * next storm of noise puts under, and it is the one place a seed is most
	 * likely to offer because low flat ground is where water goes.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Plan", meta = (ClampMin = "0.0"))
	float ClearOfWater = 220.0f;

	/** How much the ground may fall across the pad before it is too steep to start on. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Plan", meta = (ClampMin = "0.0"))
	float MaxFall = 260.0f;

	/** How much level ground a start wants around it. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Plan", meta = (ClampMin = "1.0"))
	float PadRadius = 420.0f;

	/** How far above the ground the player is put, so nothing starts inside it. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Plan", meta = (ClampMin = "0.0"))
	float Lift = 160.0f;
};

/** The answers, which are a pure function of the seed like everything else. */
struct FKBVEWorldPlan
{
	FVector Spawn = FVector::ZeroVector;
	FIntPoint SpawnChunk = FIntPoint::ZeroValue;

	/**
	 * Whether the start is on the road network.
	 *
	 * Worth knowing rather than merely preferring: the roads are where the
	 * villages are, so a start off them is a start in empty country, and a seed
	 * that can only offer that is a seed worth rerolling.
	 */
	bool bOnRoad = false;

	/** False when nothing in range was dry and level enough to stand on. */
	bool bValid = false;
};

struct KBVEWORLDCORE_API FKBVEWorldPlanner
{
	/**
	 * Work out where to start.
	 *
	 * Roads first, and not as a nicety: a road is ground the router already
	 * found a way across, so it is flat, dry and connected by construction, and
	 * it is the only place a settlement can be. Open country is the fallback for
	 * a seed whose network does not reach.
	 */
	static FKBVEWorldPlan Make(const FKBVEWorldPlanParams& Plan,
		const FKBVEWorldRoadParams& Road, const FKBVEWorldHeightfieldParams& Shape, int32 Seed);

	/**
	 * Whether one point is somewhere a person could be put.
	 *
	 * Dry, clear of the rivers, and level across the pad. Exposed because it is
	 * the part worth testing on its own -- the search around it is a loop.
	 */
	static bool IsStandable(const FKBVEWorldPlanParams& Plan, const FKBVEWorldRoadParams& Road,
		const FKBVEWorldHeightfieldParams& Shape, int32 Seed, const FVector& Where,
		float& OutGroundZ);
};
