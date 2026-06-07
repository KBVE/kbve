#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "KBVECombatInterfaces.generated.h"

class AActor;

UINTERFACE(MinimalAPI)
class UKBVECombatDamageable : public UInterface
{
	GENERATED_BODY()
};

class KBVEGAMEPLAY_API IKBVECombatDamageable
{
	GENERATED_BODY()

public:
	virtual void ApplyDamage(float Damage, AActor* Causer, const FVector& HitLocation, const FVector& Impulse) {}
	virtual void ApplyHealing(float Healing, AActor* Healer) {}
	virtual void HandleDeath(AActor* Killer) {}
	virtual void NotifyDanger(const FVector& DangerLocation, AActor* Source) {}
};

UINTERFACE(MinimalAPI)
class UKBVECombatAttacker : public UInterface
{
	GENERATED_BODY()
};

class KBVEGAMEPLAY_API IKBVECombatAttacker
{
	GENERATED_BODY()

public:
	virtual void DoAttackTrace(FName DamageSourceBone) {}
	virtual void CheckCombo() {}
	virtual void CheckChargedAttack() {}
};
