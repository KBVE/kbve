#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldSettlement.h"
#include "MassEntityQuery.h"
#include "MassEntityTypes.h"
#include "MassProcessor.h"

#include "KBVEWorldVillageMass.generated.h"

/**
 * One building, as the numbers it is derived from.
 *
 * The entity is the building and never the wall, for the reason the fence's is
 * the run and never the post: a town is thousands of buildings and hundreds of
 * thousands of walls, and a wall has no state that ever changes. What changes is
 * how much of a building is worth standing up, and that is one decision per
 * building however many walls it turns out to have.
 *
 * This is also the whole reason a village can become a city without becoming
 * another system. A city is more of these; the fragment does not get bigger, the
 * archetype does not change, and the processor walks them in chunks either way.
 */
USTRUCT()
struct KBVEWORLD_API FKBVEWorldBuildingFragment : public FMassFragment
{
	GENERATED_BODY()

	/** The chunk that owns this building, so its geometry can be rebuilt. */
	UPROPERTY() FIntPoint Chunk = FIntPoint::ZeroValue;

	UPROPERTY() FVector Centre = FVector::ZeroVector;
	UPROPERTY() float Yaw = 0.0f;
	UPROPERTY() float Width = 0.0f;
	UPROPERTY() float Depth = 0.0f;
	UPROPERTY() float Embed = 0.0f;
	UPROPERTY() int32 Storeys = 1;
	UPROPERTY() int32 Seed = 0;

	/** Reach from the centre, so the processor can measure without a footprint. */
	UPROPERTY() float Radius = 0.0f;

	/**
	 * What the building is currently standing, and what it ought to be.
	 *
	 * Kept apart because a Mass processor has no business touching a component.
	 * The processor decides on whatever thread it is given and the chunk that
	 * owns the mesh rebuilds what changed, on the thread that is allowed to.
	 */
	UPROPERTY() uint8 Detail = 0;
	UPROPERTY() uint8 WantedDetail = 0;
};

/** Marks an entity as a building, which is how the processor selects them. */
USTRUCT()
struct KBVEWORLD_API FKBVEWorldBuildingTag : public FMassTag
{
	GENERATED_BODY()
};

/**
 * Picks how much of each building is worth standing up.
 *
 * Compares distances and writes a tier, and nothing else -- the same shape as
 * the fence processor beside it, because it is the same problem: a great many
 * static things, one cheap decision each, and a rebuild that has to happen
 * somewhere a component may be touched.
 */
UCLASS()
class KBVEWORLD_API UKBVEWorldBuildingLodProcessor : public UMassProcessor
{
	GENERATED_BODY()

public:
	UKBVEWorldBuildingLodProcessor();

	/**
	 * Range each tier gives way at.
	 *
	 * Nearer than the fence's, and deliberately: a lintel is a few centimetres
	 * proud of a wall and stops being a shape at all long before a fence post
	 * stops being a silhouette.
	 */
	UPROPERTY(EditAnywhere, Config, Category = "KBVEWorld|Village", meta = (ClampMin = "0.0"))
	float FullRange = 7000.0f;

	UPROPERTY(EditAnywhere, Config, Category = "KBVEWorld|Village", meta = (ClampMin = "0.0"))
	float PlainRange = 22000.0f;

protected:
	virtual void ConfigureQueries(const TSharedRef<FMassEntityManager>& EntityManager) override;
	virtual void Execute(FMassEntityManager& EntityManager,
		FMassExecutionContext& Context) override;

private:
	FMassEntityQuery BuildingQuery;
};
