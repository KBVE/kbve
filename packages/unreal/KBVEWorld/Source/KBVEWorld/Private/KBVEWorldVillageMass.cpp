#include "KBVEWorldVillageMass.h"

#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "MassExecutionContext.h"

UKBVEWorldBuildingLodProcessor::UKBVEWorldBuildingLodProcessor()
	: BuildingQuery(*this)
{
	ExecutionFlags = (uint8)EProcessorExecutionFlags::All;
	ProcessingPhase = EMassProcessingPhase::PrePhysics;
	bAutoRegisterWithProcessingPhases = true;
	bRequiresGameThreadExecution = false;
}

void UKBVEWorldBuildingLodProcessor::ConfigureQueries(
	const TSharedRef<FMassEntityManager>& EntityManager)
{
	BuildingQuery.AddRequirement<FKBVEWorldBuildingFragment>(EMassFragmentAccess::ReadWrite);
	BuildingQuery.AddTagRequirement<FKBVEWorldBuildingTag>(EMassFragmentPresence::All);
}

void UKBVEWorldBuildingLodProcessor::Execute(FMassEntityManager& EntityManager,
	FMassExecutionContext& Context)
{
	const UWorld* World = EntityManager.GetWorld();
	if (!World)
	{
		return;
	}

	const APlayerController* PC = World->GetFirstPlayerController();
	const APawn* Pawn = PC ? PC->GetPawn() : nullptr;
	if (!Pawn)
	{
		return;
	}

	const FVector View = Pawn->GetActorLocation();
	const float Full = FullRange;
	const float Plain = PlainRange;

	BuildingQuery.ForEachEntityChunk(Context, [View, Full, Plain](FMassExecutionContext& Chunk)
	{
		const TArrayView<FKBVEWorldBuildingFragment> Buildings =
			Chunk.GetMutableFragmentView<FKBVEWorldBuildingFragment>();

		for (FKBVEWorldBuildingFragment& Building : Buildings)
		{
			// To the near face rather than the centre. A building is a good
			// fraction of the range its trim survives to, so someone standing
			// against a wall is measurably nearer to it than its middle.
			const float Distance =
				FMath::Max(FVector::Dist(View, Building.Centre) - Building.Radius, 0.0f);

			EKBVEWorldWallDetail Wanted;
			if (Distance <= Full)
			{
				Wanted = EKBVEWorldWallDetail::Full;
			}
			else if (Distance <= Plain)
			{
				Wanted = EKBVEWorldWallDetail::Plain;
			}
			else
			{
				Wanted = EKBVEWorldWallDetail::Solid;
			}

			Building.WantedDetail = static_cast<uint8>(Wanted);
		}
	});
}
