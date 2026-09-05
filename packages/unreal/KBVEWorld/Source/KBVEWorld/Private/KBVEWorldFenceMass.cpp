#include "KBVEWorldFenceMass.h"

#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "MassExecutionContext.h"

UKBVEWorldFenceLodProcessor::UKBVEWorldFenceLodProcessor()
	: RunQuery(*this)
{
	ExecutionFlags = (uint8)EProcessorExecutionFlags::All;
	ProcessingPhase = EMassProcessingPhase::PrePhysics;
	bAutoRegisterWithProcessingPhases = true;

	// Nothing here touches a component or an actor -- it compares distances and
	// writes a byte -- so unlike the grass processor beside it this does not have
	// to be pinned to the game thread.
	bRequiresGameThreadExecution = false;
}

void UKBVEWorldFenceLodProcessor::ConfigureQueries(
	const TSharedRef<FMassEntityManager>& EntityManager)
{
	RunQuery.AddRequirement<FKBVEWorldFenceRunFragment>(EMassFragmentAccess::ReadWrite);
	RunQuery.AddTagRequirement<FKBVEWorldFenceRunTag>(EMassFragmentPresence::All);
}

void UKBVEWorldFenceLodProcessor::Execute(FMassEntityManager& EntityManager,
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

	// Measured to the run's near end rather than its centre. A run is up to a few
	// thousand units long, so a viewer standing at one end of a long one is
	// nearer to it than its midpoint suggests -- and it is the end they are
	// standing next to whose posts they can count.
	const float Full = FullRange;
	const float Framed = FramedRange;

	RunQuery.ForEachEntityChunk(Context, [View, Full, Framed](FMassExecutionContext& Chunk)
	{
		const TArrayView<FKBVEWorldFenceRunFragment> Runs =
			Chunk.GetMutableFragmentView<FKBVEWorldFenceRunFragment>();

		for (FKBVEWorldFenceRunFragment& Run : Runs)
		{
			const float Distance = FMath::Max(
				FVector::Dist(View, Run.Centre) - Run.Radius, 0.0f);

			EKBVEWorldFenceDetail Wanted;
			if (Distance <= Full)
			{
				Wanted = EKBVEWorldFenceDetail::Full;
			}
			else if (Distance <= Framed)
			{
				Wanted = EKBVEWorldFenceDetail::Framed;
			}
			else
			{
				Wanted = EKBVEWorldFenceDetail::Posts;
			}

			Run.WantedDetail = static_cast<uint8>(Wanted);
		}
	});
}
