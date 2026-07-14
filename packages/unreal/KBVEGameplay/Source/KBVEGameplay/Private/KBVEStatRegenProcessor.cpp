#include "KBVEStatRegenProcessor.h"

#include "MassExecutionContext.h"
#include "KBVEStatFragment.h"

UKBVEStatRegenProcessor::UKBVEStatRegenProcessor()
	: EntityQuery(*this)
{
	ExecutionFlags = (int32)EProcessorExecutionFlags::All;
	ProcessingPhase = EMassProcessingPhase::PrePhysics;
	bAutoRegisterWithProcessingPhases = true;
}

void UKBVEStatRegenProcessor::ConfigureQueries(const TSharedRef<FMassEntityManager>& EntityManager)
{
	EntityQuery.AddRequirement<FKBVEStatFragment>(EMassFragmentAccess::ReadWrite);
}

void UKBVEStatRegenProcessor::Execute(FMassEntityManager& EntityManager, FMassExecutionContext& Context)
{
	TRACE_CPUPROFILER_EVENT_SCOPE(KBVE_StatRegen_Execute);

	const float DeltaSeconds = Context.GetDeltaTimeSeconds();

	EntityQuery.ParallelForEachEntityChunk(Context,
		[DeltaSeconds](FMassExecutionContext& Chunk)
		{
			const TArrayView<FKBVEStatFragment> Stats = Chunk.GetMutableFragmentView<FKBVEStatFragment>();
			for (FKBVEStatFragment& S : Stats)
			{
				S.Health = FMath::Min(S.Health + S.HealthRegenPerSec * DeltaSeconds, S.MaxHealth);
				S.Mana   = FMath::Min(S.Mana   + S.ManaRegenPerSec   * DeltaSeconds, S.MaxMana);
				S.Energy = FMath::Min(S.Energy + S.EnergyRegenPerSec * DeltaSeconds, S.MaxEnergy);

				const bool bDraining =
					KBVEMove::Has(S.MoveState, EKBVEMovementState::Sprinting) &&
					KBVEMove::Has(S.MoveState, EKBVEMovementState::Moving)    &&
					KBVEMove::Has(S.MoveState, EKBVEMovementState::OnGround)  &&
					!KBVEMove::HasAny(S.MoveState, EKBVEMovementState::Crouching);

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
