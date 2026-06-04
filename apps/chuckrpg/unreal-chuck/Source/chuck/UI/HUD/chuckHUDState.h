#pragma once

#include "CoreMinimal.h"

struct FchuckHUDState
{
	float HealthPercent  = 1.f;
	float ManaPercent    = 1.f;
	float StaminaPercent = 1.f;

	float DamageFlash    = 0.f;
	float LowHealthPulse = 0.f;

	float TimeSeconds    = 0.f;
};
