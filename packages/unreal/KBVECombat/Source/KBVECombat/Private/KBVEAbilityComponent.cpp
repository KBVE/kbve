#include "KBVEAbilityComponent.h"
#include "KBVECombatStatics.h"
#include "KBVECombatFeedSubsystem.h"
#include "KBVEStatTarget.h"
#include "KBVEStatIds.h"
#include "Engine/World.h"
#include "Engine/OverlapResult.h"
#include "GameFramework/Actor.h"
#include "TimerManager.h"

UKBVEAbilityComponent::UKBVEAbilityComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
	SetIsReplicatedByDefault(true);
}

const FKBVEAbilityDef* UKBVEAbilityComponent::FindAbility(FName AbilityId) const
{
	return Abilities.FindByPredicate([AbilityId](const FKBVEAbilityDef& A) { return A.AbilityId == AbilityId; });
}

bool UKBVEAbilityComponent::IsOnCooldown(FName AbilityId) const
{
	const double* Until = CooldownUntil.Find(AbilityId);
	if (!Until || !GetWorld())
	{
		return false;
	}
	return GetWorld()->GetTimeSeconds() < *Until;
}

bool UKBVEAbilityComponent::TryActivate(FName AbilityId)
{
	AActor* Owner = GetOwner();
	if (!Owner || !Owner->HasAuthority() || !PendingAbility.IsNone())
	{
		return false;
	}
	const FKBVEAbilityDef* Def = FindAbility(AbilityId);
	if (!Def || IsOnCooldown(AbilityId))
	{
		return false;
	}

	if (Def->EnergyCost > 0.0f)
	{
		if (IKBVEStatTarget* Stat = Cast<IKBVEStatTarget>(Owner))
		{
			if (Stat->GetStatValue(KBVEStats::Energy) < Def->EnergyCost)
			{
				return false;
			}
			Stat->ApplyStatDelta(KBVEStats::Energy, -Def->EnergyCost);
		}
	}

	PendingAbility = AbilityId;
	if (Def->WindupSeconds <= 0.0f)
	{
		Commit(AbilityId);
		return true;
	}

	FTimerDelegate Delegate = FTimerDelegate::CreateUObject(this, &UKBVEAbilityComponent::Commit, AbilityId);
	GetWorld()->GetTimerManager().SetTimer(WindupTimer, Delegate, Def->WindupSeconds, false);
	return true;
}

void UKBVEAbilityComponent::Commit(FName AbilityId)
{
	PendingAbility = NAME_None;

	AActor* Owner = GetOwner();
	UWorld* World = GetWorld();
	const FKBVEAbilityDef* Def = FindAbility(AbilityId);
	if (!Owner || !World || !Def)
	{
		return;
	}

	CooldownUntil.Add(AbilityId, World->GetTimeSeconds() + Def->CooldownSeconds);
	OnAbilityCommitted.Broadcast(AbilityId);

	const FVector Origin = Owner->GetActorLocation();
	const FVector HitPoint = Origin + Owner->GetActorForwardVector() * Def->Range;

	TArray<AActor*> Candidates;
	if (Def->Radius > 0.0f)
	{
		TArray<FOverlapResult> Overlaps;
		FCollisionShape Sphere = FCollisionShape::MakeSphere(Def->Radius);
		FCollisionQueryParams Params;
		Params.AddIgnoredActor(Owner);
		if (World->OverlapMultiByChannel(Overlaps, HitPoint, FQuat::Identity, ECC_Pawn, Sphere, Params))
		{
			for (const FOverlapResult& O : Overlaps)
			{
				if (AActor* A = O.GetActor())
				{
					Candidates.AddUnique(A);
				}
			}
		}
	}
	else
	{
		FHitResult Hit;
		FCollisionQueryParams Params;
		Params.AddIgnoredActor(Owner);
		if (World->LineTraceSingleByChannel(Hit, Origin, HitPoint, ECC_Pawn, Params))
		{
			if (AActor* A = Hit.GetActor())
			{
				Candidates.Add(A);
			}
		}
	}

	FKBVEDamageEvent Damage;
	Damage.Amount = Def->Damage;
	Damage.Element = Def->Element;
	Damage.Instigator = Owner;
	Damage.HitLocation = HitPoint;

	for (AActor* Target : Candidates)
	{
		if (!Def->bFriendlyFire && !UKBVECombatStatics::AreHostile(Owner, Target))
		{
			continue;
		}
		UKBVECombatStatics::ApplyDamage(Target, Damage);
	}

	const float MassRadius = Def->Radius > 0.0f ? Def->Radius : FMath::Max(Def->Range, 150.0f);
	const int32 MassHits = UKBVECombatStatics::DamageMassStatTargetsInSphere(Owner, HitPoint, MassRadius, Def->Damage);
	UE_LOG(LogTemp, Warning, TEXT("[KBVECombat] %s commit at (%.0f,%.0f) r=%.0f actorHits=%d massHits=%d"),
		*AbilityId.ToString(), HitPoint.X, HitPoint.Y, MassRadius, Candidates.Num(), MassHits);

	if (UKBVECombatFeedSubsystem* Feed = UKBVECombatFeedSubsystem::Get(Owner))
	{
		FKBVECombatFeedEntry Entry;
		Entry.Type = EKBVECombatEventType::Ability;
		Entry.Instigator = Owner;
		Entry.Element = Def->Element;
		Entry.Amount = Def->Damage;
		Entry.Label = AbilityId;
		Entry.WorldLocation = HitPoint;
		Feed->PushEvent(Entry);
	}
}
