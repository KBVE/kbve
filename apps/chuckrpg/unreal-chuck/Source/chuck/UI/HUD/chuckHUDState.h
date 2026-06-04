#pragma once

#include "CoreMinimal.h"

struct FchuckHUDState
{
	float HealthCurrent  = 100.f;
	float HealthMax      = 100.f;

	float ManaCurrent    = 100.f;
	float ManaMax        = 100.f;

	float StaminaCurrent = 100.f;
	float StaminaMax     = 100.f;

	float DamageFlash    = 0.f;
	float LowHealthPulse = 0.f;

	float TimeSeconds    = 0.f;

	float HealthFraction()  const { return HealthMax  > 0.f ? FMath::Clamp(HealthCurrent  / HealthMax,  0.f, 1.f) : 0.f; }
	float ManaFraction()    const { return ManaMax    > 0.f ? FMath::Clamp(ManaCurrent    / ManaMax,    0.f, 1.f) : 0.f; }
	float StaminaFraction() const { return StaminaMax > 0.f ? FMath::Clamp(StaminaCurrent / StaminaMax, 0.f, 1.f) : 0.f; }
};
