#include "KBVEWorldFenceMass.h"

#include "KBVEWorldChunkDirty.h"
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
	RunQuery.AddSubsystemRequirement<UKBVEWorldChunkDirtySubsystem>(
		EMassFragmentAccess::ReadWrite);
}

void UKBVEWorldFenceLodProcessor::Execute(FMassEntityManager& EntityManager,
	FMassExecutionContext& Context)
{
	const float Full = FullRange;
	const float Framed = FramedRange;

	// Read inside the chunk, not out here. A requirement is declared on the query
	// and applied to the context by the query as it runs, so the context this is
	// handed has nothing declared on it yet and asking it for a subsystem ensures.
	RunQuery.ParallelForEachEntityChunk(Context, [Full, Framed](FMassExecutionContext& Chunk)
	{
		const UKBVEWorldViewerSubsystem* Viewer =
			Chunk.GetSubsystem<UKBVEWorldViewerSubsystem>();
		if (!Viewer || !Viewer->HasViewer())
		{
			return;
		}

		const FVector View = Viewer->GetViewLocation();

		const TArrayView<FKBVEWorldFenceRunFragment> Runs =
			Chunk.GetMutableFragmentView<FKBVEWorldFenceRunFragment>();

		UKBVEWorldChunkDirtySubsystem* Dirty =
			Chunk.GetMutableSubsystem<UKBVEWorldChunkDirtySubsystem>();

		TSet<FIntPoint, DefaultKeyFuncs<FIntPoint>, TInlineSetAllocator<4>> Changed;

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

			if (Dirty && Run.WantedDetail != Run.Detail)
			{
				Changed.Add(Run.Chunk);
			}
		}

		if (Dirty)
		{
			for (const FIntPoint& Coord : Changed)
			{
				Dirty->Mark(Coord);
			}
		}
	});
}
