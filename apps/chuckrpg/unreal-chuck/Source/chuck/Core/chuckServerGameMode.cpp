// Copyright Epic Games, Inc. All Rights Reserved.

#include "chuckServerGameMode.h"
#include "Mass/chuckSlimeSubsystem.h"
#include "Engine/World.h"

AchuckServerGameMode::AchuckServerGameMode()
{
}

void AchuckServerGameMode::BeginPlay()
{
	Super::BeginPlay();

	if (!HasAuthority())
	{
		return;
	}

	if (UWorld* World = GetWorld())
	{
		if (UchuckSlimeSubsystem* Slimes = World->GetSubsystem<UchuckSlimeSubsystem>())
		{
			Slimes->SpawnSlimes(FVector::ZeroVector, SlimeCount, SlimeSpawnRadius);
			UE_LOG(LogTemp, Display, TEXT("[chuck] Server world bootstrapped: %d slimes"), SlimeCount);
		}
	}
}
