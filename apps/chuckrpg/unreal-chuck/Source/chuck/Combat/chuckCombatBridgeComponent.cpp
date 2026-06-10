#include "chuckCombatBridgeComponent.h"
#include "CombatDamageable.h"
#include "GameFramework/Actor.h"

float UchuckCombatBridgeComponent::ApplyDamage_Implementation(const FKBVEDamageEvent& DamageEvent)
{
	AActor* Owner = GetOwner();
	if (!Owner || bDead || DamageEvent.Amount <= 0.0f)
	{
		return 0.0f;
	}
	if (ICombatDamageable* Damageable = Cast<ICombatDamageable>(Owner))
	{
		Damageable->ApplyDamage(DamageEvent.Amount, DamageEvent.Instigator, DamageEvent.HitLocation, FVector::ZeroVector);
		return DamageEvent.Amount;
	}
	return 0.0f;
}
