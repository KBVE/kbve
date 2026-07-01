#include "KBVECombatStatics.h"
#include "KBVECombatant.h"
#include "KBVECombatComponent.h"
#include "KBVECombatBatchSubsystem.h"
#include "KBVECombatMass.h"
#include "GameFramework/Actor.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "MassEntitySubsystem.h"
#include "MassEntityManager.h"
#include "MassExecutionContext.h"
#include "MassCommonFragments.h"
#include "KBVEStatFragment.h"

namespace
{
	UObject* ResolveCombatant(const AActor* Actor)
	{
		if (!Actor)
		{
			return nullptr;
		}
		if (Actor->GetClass()->ImplementsInterface(UKBVECombatant::StaticClass()))
		{
			return const_cast<AActor*>(Actor);
		}
		if (UKBVECombatComponent* Comp = Actor->FindComponentByClass<UKBVECombatComponent>())
		{
			return Comp;
		}
		return nullptr;
	}
}

float UKBVECombatStatics::ApplyDamage(AActor* Target, const FKBVEDamageEvent& DamageEvent)
{
	if (UObject* Combatant = ResolveCombatant(Target))
	{
		return IKBVECombatant::Execute_ApplyDamage(Combatant, DamageEvent);
	}
	return 0.0f;
}

bool UKBVECombatStatics::IsAlive(const AActor* Target)
{
	if (UObject* Combatant = ResolveCombatant(Target))
	{
		return IKBVECombatant::Execute_IsAlive(Combatant);
	}
	return false;
}

int32 UKBVECombatStatics::GetTeamId(const AActor* Target)
{
	if (UObject* Combatant = ResolveCombatant(Target))
	{
		return IKBVECombatant::Execute_GetTeamId(Combatant);
	}
	return -1;
}

bool UKBVECombatStatics::AreHostile(const AActor* A, const AActor* B)
{
	UObject* CombatantA = ResolveCombatant(A);
	UObject* CombatantB = ResolveCombatant(B);
	if (!CombatantA || !CombatantB)
	{
		return false;
	}
	return IKBVECombatant::Execute_GetTeamId(CombatantA) != IKBVECombatant::Execute_GetTeamId(CombatantB);
}

void UKBVECombatStatics::ApplyDamageToEntity(const UObject* WorldContext, FMassEntityHandle Target, float Amount, EKBVEDamageElement Element, FMassEntityHandle Instigator)
{
	const UWorld* World = GEngine ? GEngine->GetWorldFromContextObject(WorldContext, EGetWorldErrorMode::ReturnNull) : nullptr;
	if (!World)
	{
		return;
	}
	if (UKBVECombatBatchSubsystem* Batch = World->GetSubsystem<UKBVECombatBatchSubsystem>())
	{
		FKBVEDamageRequest Request;
		Request.Target = Target;
		Request.Instigator = Instigator;
		Request.Amount = Amount;
		Request.Element = Element;
		Batch->EnqueueDamage(Request);
	}
}

bool UKBVECombatStatics::IsEntityAlive(const UObject* WorldContext, FMassEntityHandle Target)
{
	const UWorld* World = GEngine ? GEngine->GetWorldFromContextObject(WorldContext, EGetWorldErrorMode::ReturnNull) : nullptr;
	if (!World)
	{
		return false;
	}
	UMassEntitySubsystem* MassSys = World->GetSubsystem<UMassEntitySubsystem>();
	if (!MassSys)
	{
		return false;
	}
	FMassEntityManager& EM = MassSys->GetMutableEntityManager();
	if (!EM.IsEntityValid(Target))
	{
		return false;
	}
	const FKBVECombatFragment* Fragment = EM.GetFragmentDataPtr<FKBVECombatFragment>(Target);
	return Fragment && !Fragment->bDead;
}

bool UKBVECombatStatics::ApplyDotToEntity(const UObject* WorldContext, FMassEntityHandle Target, EKBVEDamageElement Element, float DamagePerSecond, float Duration, float Interval)
{
	const UWorld* World = GEngine ? GEngine->GetWorldFromContextObject(WorldContext, EGetWorldErrorMode::ReturnNull) : nullptr;
	if (!World || DamagePerSecond <= 0.0f || Duration <= 0.0f)
	{
		return false;
	}
	UMassEntitySubsystem* MassSys = World->GetSubsystem<UMassEntitySubsystem>();
	if (!MassSys)
	{
		return false;
	}
	FMassEntityManager& EM = MassSys->GetMutableEntityManager();
	if (!EM.IsEntityValid(Target))
	{
		return false;
	}
	FKBVECombatDotFragment* DotFragment = EM.GetFragmentDataPtr<FKBVECombatDotFragment>(Target);
	if (!DotFragment)
	{
		return false;
	}

	FKBVEActiveDot Dot;
	Dot.Element = Element;
	Dot.DamagePerSecond = DamagePerSecond;
	Dot.TimeRemaining = Duration;
	Dot.Interval = FMath::Max(0.05f, Interval);
	DotFragment->Dots.Add(Dot);
	return true;
}

int32 UKBVECombatStatics::DamageMassStatTargetsInSphere(const UObject* WorldContext, const FVector& Center, float Radius, float Amount)
{
	if (Amount <= 0.0f || Radius <= 0.0f)
	{
		return 0;
	}
	UWorld* World = GEngine ? GEngine->GetWorldFromContextObject(WorldContext, EGetWorldErrorMode::ReturnNull) : nullptr;
	if (!World)
	{
		return 0;
	}
	UMassEntitySubsystem* MassSys = World->GetSubsystem<UMassEntitySubsystem>();
	if (!MassSys)
	{
		return 0;
	}

	FMassEntityManager& EM = MassSys->GetMutableEntityManager();
	const double RadiusSq = static_cast<double>(Radius) * static_cast<double>(Radius);

	FMassEntityQuery Query(EM.AsShared());
	Query.AddRequirement<FTransformFragment>(EMassFragmentAccess::ReadOnly);
	Query.AddRequirement<FKBVEStatFragment>(EMassFragmentAccess::ReadWrite);

	int32 Hits = 0;
	FMassExecutionContext Context(EM);
	Query.ForEachEntityChunk(Context, [&Hits, Center, RadiusSq, Amount](FMassExecutionContext& Chunk)
	{
		const TConstArrayView<FTransformFragment> Xforms = Chunk.GetFragmentView<FTransformFragment>();
		const TArrayView<FKBVEStatFragment> Stats = Chunk.GetMutableFragmentView<FKBVEStatFragment>();
		const int32 Num = Chunk.GetNumEntities();
		for (int32 i = 0; i < Num; ++i)
		{
			if (Stats[i].Health <= 0.0f)
			{
				continue;
			}
			if (FVector::DistSquared(Xforms[i].GetTransform().GetLocation(), Center) <= RadiusSq)
			{
				Stats[i].Health = FMath::Max(0.0f, Stats[i].Health - Amount);
				++Hits;
			}
		}
	});
	return Hits;
}
