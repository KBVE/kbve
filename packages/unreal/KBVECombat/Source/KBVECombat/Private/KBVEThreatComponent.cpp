#include "KBVEThreatComponent.h"
#include "KBVECombatComponent.h"
#include "GameFramework/Actor.h"

UKBVEThreatComponent::UKBVEThreatComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UKBVEThreatComponent::BeginPlay()
{
	Super::BeginPlay();

	if (AActor* Owner = GetOwner())
	{
		if (UKBVECombatComponent* Combat = Owner->FindComponentByClass<UKBVECombatComponent>())
		{
			Combat->OnDamaged.AddDynamic(this, &UKBVEThreatComponent::HandleDamaged);
		}
	}
}

void UKBVEThreatComponent::HandleDamaged(const FKBVEDamageEvent& DamageEvent, float NewHealth)
{
	AddThreat(DamageEvent.Instigator, DamageEvent.Amount * ThreatPerDamage);
}

void UKBVEThreatComponent::AddThreat(AActor* Source, float Amount)
{
	if (!Source || Amount <= 0.0f)
	{
		return;
	}
	float& Threat = ThreatTable.FindOrAdd(Source);
	Threat += Amount;
}

void UKBVEThreatComponent::ClearThreat(AActor* Source)
{
	ThreatTable.Remove(Source);
}

AActor* UKBVEThreatComponent::GetTopThreatTarget() const
{
	AActor* Best = nullptr;
	float BestThreat = 0.0f;
	for (const TPair<TObjectPtr<AActor>, float>& Pair : ThreatTable)
	{
		if (Pair.Key && Pair.Value > BestThreat)
		{
			BestThreat = Pair.Value;
			Best = Pair.Key;
		}
	}
	return Best;
}
