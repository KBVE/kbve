#include "KBVECombatDotProcessor.h"

#include "MassExecutionContext.h"
#include "KBVECombatMass.h"
#include "KBVECombatTypes.h"
#include "KBVECombatBatchSubsystem.h"
#include "Engine/World.h"

UKBVECombatDotProcessor::UKBVECombatDotProcessor()
	: EntityQuery(*this)
{
	ExecutionFlags = (int32)EProcessorExecutionFlags::All;
	ProcessingPhase = EMassProcessingPhase::PrePhysics;
	bAutoRegisterWithProcessingPhases = true;
}

void UKBVECombatDotProcessor::ConfigureQueries(const TSharedRef<FMassEntityManager>& EntityManager)
{
	EntityQuery.AddRequirement<FKBVECombatDotFragment>(EMassFragmentAccess::ReadWrite);
	EntityQuery.AddRequirement<FKBVECombatFragment>(EMassFragmentAccess::ReadOnly);
}

void UKBVECombatDotProcessor::Execute(FMassEntityManager& EntityManager, FMassExecutionContext& Context)
{
	TRACE_CPUPROFILER_EVENT_SCOPE(KBVE_CombatDot_Execute);

	const float DeltaSeconds = Context.GetDeltaTimeSeconds();
	UWorld* World = EntityManager.GetWorld();
	if (!World || World->GetNetMode() == NM_Client)
	{
		return;
	}
	UKBVECombatBatchSubsystem* Batch = World->GetSubsystem<UKBVECombatBatchSubsystem>();
	if (!Batch)
	{
		return;
	}

	EntityQuery.ParallelForEachEntityChunk(EntityManager, Context,
		[DeltaSeconds, Batch](FMassExecutionContext& Chunk)
		{
			const TArrayView<FKBVECombatDotFragment> DotViews = Chunk.GetMutableFragmentView<FKBVECombatDotFragment>();
			const TConstArrayView<FKBVECombatFragment> CombatViews = Chunk.GetFragmentView<FKBVECombatFragment>();
			const int32 Num = Chunk.GetNumEntities();

			for (int32 i = 0; i < Num; ++i)
			{
				TArray<FKBVEActiveDot>& Dots = DotViews[i].Dots;
				if (CombatViews[i].bDead)
				{
					Dots.Reset();
					continue;
				}

				const FMassEntityHandle Entity = Chunk.GetEntity(i);
				for (int32 d = Dots.Num() - 1; d >= 0; --d)
				{
					FKBVEActiveDot& Dot = Dots[d];
					Dot.TimeRemaining -= DeltaSeconds;
					Dot.Accumulator += DeltaSeconds;

					while (Dot.Accumulator >= Dot.Interval && Dot.Interval > 0.0f)
					{
						Dot.Accumulator -= Dot.Interval;
						FKBVEDamageRequest Request;
						Request.Target = Entity;
						Request.Instigator = Entity;
						Request.Amount = Dot.DamagePerSecond * Dot.Interval;
						Request.Element = Dot.Element;
						Batch->EnqueueDamage(Request);
					}

					if (Dot.TimeRemaining <= 0.0f)
					{
						Dots.RemoveAt(d);
					}
				}
			}
		});
}
