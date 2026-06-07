#include "KBVEEffectComponent.h"

#include "KBVEStatTarget.h"

UKBVEEffectComponent::UKBVEEffectComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = false;
}

void UKBVEEffectComponent::BeginPlay()
{
	Super::BeginPlay();

	if (!StatTargetObject.IsValid() && Cast<IKBVEStatTarget>(GetOwner()))
	{
		StatTargetObject = GetOwner();
	}
}

void UKBVEEffectComponent::SetStatTarget(UObject* InTarget)
{
	StatTargetObject = InTarget;
}

IKBVEStatTarget* UKBVEEffectComponent::ResolveTarget() const
{
	if (IKBVEStatTarget* Target = Cast<IKBVEStatTarget>(StatTargetObject.Get()))
	{
		return Target;
	}
	return Cast<IKBVEStatTarget>(GetOwner());
}

bool UKBVEEffectComponent::IsOnCooldown(FName SourceKey) const
{
	const float* Remaining = Cooldowns.Find(SourceKey);
	return Remaining && *Remaining > 0.f;
}

float UKBVEEffectComponent::GetCooldownRemaining(FName SourceKey) const
{
	return Cooldowns.FindRef(SourceKey);
}

bool UKBVEEffectComponent::TryApplyEffect(const FKBVEEffectSpec& Spec)
{
	if (Spec.Cooldown > 0.f && IsOnCooldown(Spec.SourceKey))
	{
		return false;
	}

	IKBVEStatTarget* Target = ResolveTarget();
	if (!Target)
	{
		return false;
	}

	for (const FKBVEStatRestore& R : Spec.Restores)
	{
		Target->ApplyStatDelta(R.StatId, R.Amount);
	}

	for (const FKBVEStatRegen& R : Spec.Regens)
	{
		if (R.Duration > 0.f && R.RatePerSecond != 0.f)
		{
			ActiveRegens.Add(FActiveRegen{ R.StatId, R.RatePerSecond, R.Duration });
		}
	}

	for (const FKBVEStatBuff& B : Spec.Buffs)
	{
		Target->AddStatModifier(B.StatId, B.Key, B.Magnitude, B.Op);
		if (B.Duration > 0.f)
		{
			ActiveBuffs.Add(FActiveBuff{ B.StatId, B.Key, B.Duration });
		}
	}

	for (const FKBVEStatusEffect& S : Spec.Statuses)
	{
		ActiveStatuses.Add(FActiveStatus{ S.Kind, S.Stacks, S.Duration });
		OnStatusChanged.Broadcast(S.Kind, S.Stacks);
	}

	if (Spec.Cooldown > 0.f)
	{
		Cooldowns.Add(Spec.SourceKey, Spec.Cooldown);
		OnCooldownStarted.Broadcast(Spec.SourceKey, Spec.Cooldown);
	}

	OnEffectApplied.Broadcast(Spec.SourceKey);
	UpdateTickEnabled();
	return true;
}

void UKBVEEffectComponent::ClearAllEffects()
{
	if (IKBVEStatTarget* Target = ResolveTarget())
	{
		for (const FActiveBuff& B : ActiveBuffs)
		{
			Target->RemoveStatModifier(B.StatId, B.Key);
		}
	}
	for (const FActiveStatus& S : ActiveStatuses)
	{
		OnStatusChanged.Broadcast(S.Kind, 0);
	}
	ActiveRegens.Reset();
	ActiveBuffs.Reset();
	ActiveStatuses.Reset();
	Cooldowns.Reset();
	UpdateTickEnabled();
}

void UKBVEEffectComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	IKBVEStatTarget* Target = ResolveTarget();
	if (!Target)
	{
		ActiveRegens.Reset();
		ActiveBuffs.Reset();
		ActiveStatuses.Reset();
		Cooldowns.Reset();
		UpdateTickEnabled();
		return;
	}

	for (int32 i = ActiveRegens.Num() - 1; i >= 0; --i)
	{
		FActiveRegen& R = ActiveRegens[i];
		const float Step = FMath::Min(DeltaTime, R.Remaining);
		Target->ApplyStatDelta(R.StatId, R.RatePerSecond * Step);
		R.Remaining -= DeltaTime;
		if (R.Remaining <= 0.f)
		{
			ActiveRegens.RemoveAt(i);
		}
	}

	for (int32 i = ActiveBuffs.Num() - 1; i >= 0; --i)
	{
		FActiveBuff& B = ActiveBuffs[i];
		B.Remaining -= DeltaTime;
		if (B.Remaining <= 0.f)
		{
			Target->RemoveStatModifier(B.StatId, B.Key);
			ActiveBuffs.RemoveAt(i);
		}
	}

	for (int32 i = ActiveStatuses.Num() - 1; i >= 0; --i)
	{
		FActiveStatus& S = ActiveStatuses[i];
		if (S.Remaining <= 0.f)
		{
			continue;
		}
		S.Remaining -= DeltaTime;
		if (S.Remaining <= 0.f)
		{
			OnStatusChanged.Broadcast(S.Kind, 0);
			ActiveStatuses.RemoveAt(i);
		}
	}

	for (auto It = Cooldowns.CreateIterator(); It; ++It)
	{
		It->Value -= DeltaTime;
		if (It->Value <= 0.f)
		{
			It.RemoveCurrent();
		}
	}

	UpdateTickEnabled();
}

void UKBVEEffectComponent::UpdateTickEnabled()
{
	const bool bActive =
		ActiveRegens.Num() > 0 ||
		ActiveBuffs.Num() > 0 ||
		ActiveStatuses.Num() > 0 ||
		Cooldowns.Num() > 0;
	SetComponentTickEnabled(bActive);
}
