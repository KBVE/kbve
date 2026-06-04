#include "chuckStatRegenProcessor.h"

#include "MassExecutionContext.h"
#include "chuckStatsFragment.h"

UchuckStatRegenProcessor::UchuckStatRegenProcessor()
	: EntityQuery(*this)
{
	ExecutionFlags = (int32)EProcessorExecutionFlags::All;
	ProcessingPhase = EMassProcessingPhase::PrePhysics;
	bAutoRegisterWithProcessingPhases = true;
}

void UchuckStatRegenProcessor::ConfigureQueries(const TSharedRef<FMassEntityManager>& EntityManager)
{
	EntityQuery.AddRequirement<FchuckStatsFragment>(EMassFragmentAccess::ReadWrite);
}

void UchuckStatRegenProcessor::Execute(FMassEntityManager& EntityManager, FMassExecutionContext& Context)
{
	TRACE_CPUPROFILER_EVENT_SCOPE(chuck_StatRegen_Execute);

	const float DeltaSeconds = Context.GetDeltaTimeSeconds();

	EntityQuery.ParallelForEachEntityChunk(EntityManager, Context,
		[DeltaSeconds](FMassExecutionContext& Chunk)
		{
			const TArrayView<FchuckStatsFragment> Stats = Chunk.GetMutableFragmentView<FchuckStatsFragment>();
			for (FchuckStatsFragment& S : Stats)
			{
				S.Health = FMath::Min(S.Health + S.HealthRegenPerSec * DeltaSeconds, S.MaxHealth);
				S.Mana   = FMath::Min(S.Mana   + S.ManaRegenPerSec   * DeltaSeconds, S.MaxMana);

				if (S.bIsSprinting && S.bIsMoving)
				{
					S.Stamina = FMath::Max(S.Stamina - S.StaminaSprintDrainPerSec * DeltaSeconds, 0.f);
				}
				else
				{
					S.Stamina = FMath::Min(S.Stamina + S.StaminaRegenPerSec * DeltaSeconds, S.MaxStamina);
				}
			}
		});
}
