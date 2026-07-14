#pragma once

#include "CoreMinimal.h"
#include "MassEntityTypes.h"
#include "chuckSlimeTypes.generated.h"

USTRUCT()
struct FchuckSlimeTag : public FMassTag
{
	GENERATED_BODY()
};

USTRUCT()
struct FchuckSlimeFragment : public FMassFragment
{
	GENERATED_BODY()

	FVector TargetLocation = FVector::ZeroVector;
	float Speed = 140.f;
	float GroundZ = 0.f;
	float HopPhase = 0.f;
	float RepathTimer = 0.f;
	float FrameTime = 0.f;
	int32 Frame = 0;
	int32 PathIndex = 0;
	int32 HopCycle = -1;
	int32 FacingRow = 0;
	float FacingFlip = 0.f;
	float LastYaw = 0.f;
	float TurnTimer = 0.f;
	float UpsertTimer = 0.f;
	uint8 bInCombat = 0;
	uint8 bDead = 0;

	float HP = 20.f;
	float MaxHP = 20.f;
	float Attack = 0.f;
	float Defense = 0.f;
	float GroundTimer = 0.f;
};
