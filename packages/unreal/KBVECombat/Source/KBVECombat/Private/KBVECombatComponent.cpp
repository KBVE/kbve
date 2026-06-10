#include "KBVECombatComponent.h"
#include "KBVEStatTarget.h"
#include "Net/UnrealNetwork.h"
#include "GameFramework/Actor.h"

UKBVECombatComponent::UKBVECombatComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
	SetIsReplicatedByDefault(true);
}

void UKBVECombatComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(UKBVECombatComponent, bIsDead);
}

float UKBVECombatComponent::GetHealth() const
{
	if (const IKBVEStatTarget* StatTarget = Cast<IKBVEStatTarget>(GetOwner()))
	{
		return StatTarget->GetStatValue(HealthStatId);
	}
	return 0.0f;
}

float UKBVECombatComponent::ApplyDamage_Implementation(const FKBVEDamageEvent& DamageEvent)
{
	AActor* Owner = GetOwner();
	if (!Owner || !Owner->HasAuthority() || bIsDead || DamageEvent.Amount <= 0.0f)
	{
		return 0.0f;
	}

	IKBVEStatTarget* StatTarget = Cast<IKBVEStatTarget>(Owner);
	if (!StatTarget)
	{
		return 0.0f;
	}

	const float Before = StatTarget->GetStatValue(HealthStatId);
	StatTarget->ApplyStatDelta(HealthStatId, -DamageEvent.Amount);
	const float After = StatTarget->GetStatValue(HealthStatId);
	const float Applied = Before - After;

	OnDamaged.Broadcast(DamageEvent, After);

	if (After <= 0.0f)
	{
		bIsDead = true;
		OnDeath.Broadcast(DamageEvent.Instigator);
	}

	return Applied;
}

void UKBVECombatComponent::OnRep_IsDead()
{
	if (bIsDead)
	{
		OnDeath.Broadcast(nullptr);
	}
}
