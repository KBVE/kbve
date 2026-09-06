#include "KBVEWorldFenceMass.h"

#include "KBVEWorldViewer.h"
#include "MassExecutionContext.h"

UKBVEWorldFenceLodProcessor::UKBVEWorldFenceLodProcessor()
	: RunQuery(*this)
{
	ExecutionFlags = (uint8)EProcessorExecutionFlags::All;
	ProcessingPhase = EMassProcessingPhase::PrePhysics;
	bAutoRegisterWithProcessingPhases = true;

	bRequiresGameThreadExecution = false;
}

void UKBVEWorldFenceLodProcessor::ConfigureQueries(
	const TSharedRef<FMassEntityManager>& EntityManager)
{
	RunQuery.AddRequirement<FKBVEWorldFenceRunFragment>(EMassFragmentAccess::ReadWrite);
	RunQuery.AddTagRequirement<FKBVEWorldFenceRunTag>(EMassFragmentPresence::All);
	RunQuery.AddSubsystemRequirement<UKBVEWorldViewerSubsystem>(EMassFragmentAccess::ReadOnly);
}

void UKBVEWorldFenceLodProcessor::Execute(FMassEntityManager& EntityManager,
	FMassExecutionContext& Context)
{
	const UKBVEWorldViewerSubsystem* Viewer =
		Context.GetSubsystem<UKBVEWorldViewerSubsystem>();
	if (!Viewer || !Viewer->HasViewer())
	{
		return;
	}

	const FVector View = Viewer->GetViewLocation();

	const float Full = FullRange;
	const float Framed = FramedRange;

	RunQuery.ParallelForEachEntityChunk(Context, [View, Full, Framed](FMassExecutionContext& Chunk)
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
