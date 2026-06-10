#include "chuckCombatCharacter.h"
#include "chuckCombatBridgeComponent.h"
#include "KBVECombatFeedSubsystem.h"
#include "KBVECombatTypes.h"

AchuckCombatCharacter::AchuckCombatCharacter()
{
	CombatBridge = CreateDefaultSubobject<UchuckCombatBridgeComponent>(TEXT("CombatBridge"));
}

void AchuckCombatCharacter::ApplyDamage(float Damage, AActor* DamageCauser, const FVector& DamageLocation, const FVector& DamageImpulse)
{
	Super::ApplyDamage(Damage, DamageCauser, DamageLocation, DamageImpulse);

	if (UKBVECombatFeedSubsystem* Feed = UKBVECombatFeedSubsystem::Get(this))
	{
		FKBVECombatFeedEntry Entry;
		Entry.Type = EKBVECombatEventType::Damage;
		Entry.Instigator = DamageCauser;
		Entry.Target = this;
		Entry.Amount = Damage;
		Entry.WorldLocation = DamageLocation;
		Feed->PushEvent(Entry);
	}
}

void AchuckCombatCharacter::HandleDeath()
{
	Super::HandleDeath();

	if (CombatBridge)
	{
		CombatBridge->MarkDead();
	}

	if (UKBVECombatFeedSubsystem* Feed = UKBVECombatFeedSubsystem::Get(this))
	{
		FKBVECombatFeedEntry Entry;
		Entry.Type = EKBVECombatEventType::Death;
		Entry.Target = this;
		Entry.WorldLocation = GetActorLocation();
		Feed->PushEvent(Entry);
	}
}
