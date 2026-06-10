#include "KBVEStatusEffectComponent.h"
#include "KBVECombatStatics.h"
#include "KBVEStatTarget.h"
#include "GameFramework/Actor.h"
#include "Engine/World.h"
#include "TimerManager.h"

UKBVEStatusEffectComponent::UKBVEStatusEffectComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

FName UKBVEStatusEffectComponent::ResolveModifierKey(FName EffectId, const FKBVEStatModifierSpec& Spec)
{
	return Spec.ModifierKey.IsNone() ? EffectId : Spec.ModifierKey;
}

void UKBVEStatusEffectComponent::ApplyStatus(const FKBVEStatusEffectDef& Effect)
{
	AActor* Owner = GetOwner();
	UWorld* World = GetWorld();
	if (!Owner || !World || !Owner->HasAuthority() || Effect.EffectId.IsNone())
	{
		return;
	}

	if (ActiveStatuses.Contains(Effect.EffectId))
	{
		RemoveStatus(Effect.EffectId);
	}

	if (IKBVEStatTarget* StatTarget = Cast<IKBVEStatTarget>(Owner))
	{
		for (const FKBVEStatModifierSpec& Spec : Effect.Modifiers)
		{
			StatTarget->AddStatModifier(Spec.StatId, ResolveModifierKey(Effect.EffectId, Spec), Spec.Magnitude, Spec.Op);
		}
	}

	FActiveStatus& Active = ActiveStatuses.Add(Effect.EffectId);
	Active.Def = Effect;

	if (Effect.Duration > 0.0f)
	{
		FTimerDelegate Expiry = FTimerDelegate::CreateUObject(this, &UKBVEStatusEffectComponent::RemoveStatus, Effect.EffectId);
		World->GetTimerManager().SetTimer(Active.ExpiryTimer, Expiry, Effect.Duration, false);
	}

	if (Effect.DotPerSecond > 0.0f)
	{
		FTimerDelegate Dot = FTimerDelegate::CreateUObject(this, &UKBVEStatusEffectComponent::TickDot, Effect.EffectId);
		World->GetTimerManager().SetTimer(Active.DotTimer, Dot, FMath::Max(0.05f, Effect.DotInterval), true);
	}

	OnStatusApplied.Broadcast(Effect.EffectId);
}

void UKBVEStatusEffectComponent::RemoveStatus(FName EffectId)
{
	FActiveStatus* Active = ActiveStatuses.Find(EffectId);
	if (!Active)
	{
		return;
	}

	if (IKBVEStatTarget* StatTarget = Cast<IKBVEStatTarget>(GetOwner()))
	{
		for (const FKBVEStatModifierSpec& Spec : Active->Def.Modifiers)
		{
			StatTarget->RemoveStatModifier(Spec.StatId, ResolveModifierKey(EffectId, Spec));
		}
	}

	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(Active->ExpiryTimer);
		World->GetTimerManager().ClearTimer(Active->DotTimer);
	}

	ActiveStatuses.Remove(EffectId);
	OnStatusRemoved.Broadcast(EffectId);
}

void UKBVEStatusEffectComponent::TickDot(FName EffectId)
{
	const FActiveStatus* Active = ActiveStatuses.Find(EffectId);
	AActor* Owner = GetOwner();
	if (!Active || !Owner)
	{
		return;
	}

	FKBVEDamageEvent Damage;
	Damage.Amount = Active->Def.DotPerSecond * Active->Def.DotInterval;
	Damage.Element = Active->Def.DotElement;
	Damage.Instigator = Owner;
	UKBVECombatStatics::ApplyDamage(Owner, Damage);
}
