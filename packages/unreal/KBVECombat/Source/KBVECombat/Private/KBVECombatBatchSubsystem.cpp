#include "KBVECombatBatchSubsystem.h"
#include "KBVECombatMass.h"
#include "MassEntitySubsystem.h"
#include "MassEntityManager.h"
#include "Engine/World.h"

bool UKBVECombatBatchSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
	if (!Super::ShouldCreateSubsystem(Outer))
	{
		return false;
	}
	const UWorld* World = Cast<UWorld>(Outer);
	return World && World->IsGameWorld();
}

TStatId UKBVECombatBatchSubsystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(UKBVECombatBatchSubsystem, STATGROUP_Tickables);
}

void UKBVECombatBatchSubsystem::EnqueueDamage(const FKBVEDamageRequest& Request)
{
	DamageQueue.Enqueue(Request);
}

void UKBVECombatBatchSubsystem::Tick(float DeltaTime)
{
	UWorld* World = GetWorld();
	if (!World || World->GetNetMode() == NM_Client)
	{
		return;
	}

	UMassEntitySubsystem* MassSys = World->GetSubsystem<UMassEntitySubsystem>();
	if (!MassSys)
	{
		return;
	}
	FMassEntityManager& EM = MassSys->GetMutableEntityManager();

	TArray<TPair<FMassEntityHandle, FMassEntityHandle>> Deaths;
	FKBVEDamageRequest Request;
	while (DamageQueue.Dequeue(Request))
	{
		if (Request.Amount <= 0.0f || !EM.IsEntityValid(Request.Target))
		{
			continue;
		}
		FKBVECombatFragment* Fragment = EM.GetFragmentDataPtr<FKBVECombatFragment>(Request.Target);
		if (!Fragment || Fragment->bDead)
		{
			continue;
		}
		float Scaled = Request.Amount;
		if (const FKBVECombatResistFragment* Resist = EM.GetFragmentDataPtr<FKBVECombatResistFragment>(Request.Target))
		{
			Scaled *= Resist->GetMultiplier(Request.Element);
		}
		if (Scaled <= 0.0f)
		{
			continue;
		}
		Fragment->Health = FMath::Max(0.0f, Fragment->Health - Scaled);
		if (Fragment->Health <= 0.0f)
		{
			Fragment->bDead = true;
			Deaths.Emplace(Request.Target, Request.Instigator);
		}
	}

	for (const TPair<FMassEntityHandle, FMassEntityHandle>& Death : Deaths)
	{
		OnEntityDied.Broadcast(Death.Key, Death.Value);
	}
}
