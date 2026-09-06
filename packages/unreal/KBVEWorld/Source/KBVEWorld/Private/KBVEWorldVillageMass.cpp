#include "KBVEWorldVillageMass.h"

#include "KBVEWorldChunkDirty.h"
#include "KBVEWorldViewer.h"
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

	BuildingQuery.AddSubsystemRequirement<UKBVEWorldViewerSubsystem>(
		EMassFragmentAccess::ReadOnly);
	BuildingQuery.AddSubsystemRequirement<UKBVEWorldChunkDirtySubsystem>(
		EMassFragmentAccess::ReadWrite);
}

void UKBVEWorldBuildingLodProcessor::Execute(FMassEntityManager& EntityManager,
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
	const float Plain = PlainRange;

	BuildingQuery.ParallelForEachEntityChunk(Context,
		[View, Full, Plain](FMassExecutionContext& Chunk)
	{
		const TArrayView<FKBVEWorldBuildingFragment> Buildings =
			Chunk.GetMutableFragmentView<FKBVEWorldBuildingFragment>();

		UKBVEWorldChunkDirtySubsystem* Dirty =
			Chunk.GetMutableSubsystem<UKBVEWorldChunkDirtySubsystem>();

		TSet<FIntPoint, DefaultKeyFuncs<FIntPoint>, TInlineSetAllocator<4>> Changed;

		for (FKBVEWorldBuildingFragment& Building : Buildings)
		{
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

			if (Dirty && Building.WantedDetail != Building.Detail)
			{
				Changed.Add(Building.Chunk);
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
