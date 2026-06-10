#include "KBVECombatStatics.h"
#include "KBVECombatant.h"
#include "KBVECombatComponent.h"
#include "GameFramework/Actor.h"

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
