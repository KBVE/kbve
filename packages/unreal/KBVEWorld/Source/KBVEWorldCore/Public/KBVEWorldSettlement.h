#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldBuilding.h"
#include "KBVEWorldHeightfieldParams.h"
#include "KBVEWorldRoadField.h"
#include "KBVEWorldRoadGraph.h"

#include "KBVEWorldSettlement.generated.h"

/**
 * Where buildings stand, and how many of them.
 *
 * A settlement is put on a road because that is what a settlement is: people
 * build where the route already goes, and a village that ignored the network
 * would be a field of houses reachable only across country. It is also what
 * makes this affordable -- the road is already a solved polyline by the time
 * anything needs to know where a house goes.
 *
 * Nothing here says village or town. The difference between them is how many
 * plots an edge carries and how close together they sit, which is two numbers,
 * so a city is this with the density turned up rather than another system.
 */
USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldSettlementParams
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement")
	FKBVEWorldBuildingParams Building;

	/**
	 * How much of the network is built along, as a fraction of its edges.
	 *
	 * Low on purpose, for the reason the fences are: what makes somewhere read as
	 * a settlement is the empty road either side of it.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float Chance = 0.2f;

	/**
	 * How far off the centre line the near face of a building stands.
	 *
	 * Outside the road's own graded strip. The ground under a plot is taken from
	 * the graded surface rather than the raw heightfield, so a building may sit
	 * inside the wider cutting the road eased into the hillside -- what it may
	 * not do is stand in the carriageway.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement", meta = (ClampMin = "0.0"))
	float Setback = 620.0f;

	/** Shortest gap between two buildings along the road. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement", meta = (ClampMin = "0.0"))
	float MinGap = 240.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement", meta = (ClampMin = "0.0"))
	float MaxGap = 900.0f;

	/** Most plots one edge may carry, which is what makes a town a town. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement", meta = (ClampMin = "1"))
	int32 MaxPlots = 14;

	/**
	 * Steepest ground a building will stand on, as a fall across its footprint.
	 *
	 * A house does not drape: its floor is one height, so on a slope the plinth
	 * on the low side has to make up the whole difference. Past this it is a wall
	 * of masonry holding a cottage up, which is a retaining wall and a different
	 * building. A plot that fails this is skipped rather than flattened, so the
	 * terrain keeps its shape and the village grows where the ground allows.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settlement", meta = (ClampMin = "0.0"))
	float MaxFall = 190.0f;
};

/**
 * One plot, as a place on a road rather than a place in the world.
 *
 * Cheap by construction: deciding where the houses of a settlement go touches no
 * heightfield, so a chunk can know it has fourteen buildings on it long before
 * anything is close enough to make it work out what they look like.
 */
struct FKBVEWorldPlot
{
	/** Which side of the road, as the sign of the lateral offset. */
	float Side = 1.0f;

	/** Distance along the edge's polyline. */
	float Along = 0.0f;

	int32 Seed = 0;
};

struct KBVEWORLDCORE_API FKBVEWorldSettlement
{
	/**
	 * The plots one road edge carries.
	 *
	 * Pure in the seed and the edge, so both ends of a connection raise the same
	 * village without a byte crossing the wire, and a chunk streamed out and back
	 * comes home the same place. Crossings are skipped: the stretch of road on a
	 * bridge is over a river, and nobody builds there.
	 */
	static void FindPlots(const FKBVEWorldSettlementParams& Settlement,
		const FKBVEWorldRoadParams& Road, int32 Seed, const FIntPoint& Edge,
		const TArray<FVector>& Path, const TArray<FKBVEWorldRoadSpan>& Spans,
		TArray<FKBVEWorldPlot>& OutPlots);

	/**
	 * Turn a plot into a building standing on the ground, or refuse it.
	 *
	 * The expensive half, and the only part that samples terrain: the floor is
	 * levelled to the highest corner of the footprint and the plinth is sunk to
	 * the lowest, which is what puts a house on a hillside without either
	 * floating at one corner or burying itself at another. Returns false where
	 * the ground falls too far across the plot to build on at all.
	 */
	static bool Site(const FKBVEWorldSettlementParams& Settlement,
		const FKBVEWorldRoadParams& Road, const FKBVEWorldHeightfieldParams& Shape, int32 Seed,
		const FKBVEWorldRoadField* Field, const TArray<FVector>& Path,
		const FKBVEWorldPlot& Plot, FKBVEWorldBuildingPlan& OutPlan);
};
