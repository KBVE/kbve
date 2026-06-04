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

				const bool bDraining =
					chuckMove::Has(S.MoveState, EchuckMoveState::Sprinting) &&
					chuckMove::Has(S.MoveState, EchuckMoveState::Moving)    &&
					chuckMove::Has(S.MoveState, EchuckMoveState::OnGround)  &&
					!chuckMove::HasAny(S.MoveState, EchuckMoveState::Crouching);

				if (S.StaminaRegenDelay > 0.f)
				{
					S.StaminaRegenDelay = FMath::Max(0.f, S.StaminaRegenDelay - DeltaSeconds);
				}
				else if (bDraining)
				{
					S.Stamina = FMath::Max(0.f, S.Stamina - S.StaminaSprintDrainPerSec * DeltaSeconds);
					if (S.Stamina <= 0.f)
					{
						S.StaminaRegenDelay = S.StaminaEmptyPenaltySec;
					}
				}
				else
				{
					const float Rate =
						(S.Stamina <= S.StaminaLowThreshold)
							? S.StaminaRegenPerSec * S.StaminaLowRegenMultiplier
							: S.StaminaRegenPerSec;
					S.Stamina = FMath::Min(S.Stamina + Rate * DeltaSeconds, S.MaxStamina);
				}
			}
		});
}
