#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldFence.h"
#include "MassEntityQuery.h"
#include "MassEntityTypes.h"
#include "MassProcessor.h"

#include "KBVEWorldFenceMass.generated.h"

/**
 * One run of roadside fence, as the stretch of road it runs beside.
 *
 * The entity is the run and never the post. A run is a handful of numbers and a
 * thousand posts, so making the post the entity would put the world's fence
 * count into the millions to describe something that is decided by a dozen
 * floats -- and every one of those entities would sit in an archetype doing
 * nothing, because a post has no state that ever changes.
 *
 * What does change is how much of a run is worth standing up, which is a
 * function of where the viewer is. That is the calculation this lane exists for,
 * and it is the same one the grass clusters make.
 */
USTRUCT()
struct KBVEWORLD_API FKBVEWorldFenceRunFragment : public FMassFragment
{
	GENERATED_BODY()

	/** The edge this run lies along, which is what its geometry is derived from. */
	UPROPERTY() FIntPoint Edge = FIntPoint::ZeroValue;

	UPROPERTY() float Side = 1.0f;
	UPROPERTY() float Begin = 0.0f;
	UPROPERTY() float End = 0.0f;

	/** Midpoint and reach, so the processor can measure without a road lookup. */
	UPROPERTY() FVector Centre = FVector::ZeroVector;
	UPROPERTY() float Radius = 0.0f;

	UPROPERTY() int32 RunSeed = 0;
	UPROPERTY() uint8 Style = 0;

	/**
	 * What the run is currently standing up, and what it ought to be.
	 *
	 * Kept apart so the processor can decide on its own thread and leave the
	 * rebuild to whatever owns the instances -- a Mass processor has no business
	 * touching a component.
	 */
	UPROPERTY() uint8 Detail = 0;
	UPROPERTY() uint8 WantedDetail = 0;
};

/** Marks an entity as a fence run, which is how the processor selects them. */
USTRUCT()
struct KBVEWORLD_API FKBVEWorldFenceRunTag : public FMassTag
{
	GENERATED_BODY()
};

/**
 * Picks how much of each fence run is worth standing up.
 *
 * All this does is compare distances and write a tier. It deliberately does not
 * build anything: geometry lands in a hierarchical instanced mesh, that is a
 * component, and components are the game thread's. The run that changed tier is
 * collected and handed back for the owner to rebuild.
 */
UCLASS()
class KBVEWORLD_API UKBVEWorldFenceLodProcessor : public UMassProcessor
{
	GENERATED_BODY()

public:
	UKBVEWorldFenceLodProcessor();

	/**
	 * Range each tier gives way at.
	 *
	 * Config rather than arguments: the processor registers itself with the
	 * phases, so there is no moment where anything owns it long enough to be
	 * asked to configure it.
	 */
	UPROPERTY(EditAnywhere, Config, Category = "KBVEWorld|Fence", meta = (ClampMin = "0.0"))
	float FullRange = 12000.0f;

	UPROPERTY(EditAnywhere, Config, Category = "KBVEWorld|Fence", meta = (ClampMin = "0.0"))
	float FramedRange = 30000.0f;

protected:
	virtual void ConfigureQueries(const TSharedRef<FMassEntityManager>& EntityManager) override;
	virtual void Execute(FMassEntityManager& EntityManager,
		FMassExecutionContext& Context) override;

private:
	FMassEntityQuery RunQuery;
};
