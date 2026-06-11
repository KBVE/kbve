// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Core/chuckCoreGameMode.h"
#include "chuckServerGameMode.generated.h"

/**
 * Dedicated-server world GameMode. Inherits the core gameplay pawn/controller
 * setup and, on the authority, bootstraps the server-authoritative world
 * (spawns the Mass slime swarm that replicates to clients via KBVENet/Iris).
 * Selected on the dedicated build via the launch GameMode arg / ServerDefaultMap.
 */
UCLASS()
class AchuckServerGameMode : public AchuckCoreGameMode
{
	GENERATED_BODY()

public:
	AchuckServerGameMode();

	virtual void BeginPlay() override;
	virtual void InitNewPlayer(AController* NewPlayerController, const FUniqueNetIdRepl& UniqueId, const FString& Options, const FString& Portal) override;
	virtual void Logout(AController* Exiting) override;

	UPROPERTY(EditDefaultsOnly, Category = "KBVE|Server")
	int32 SlimeCount = 30;

	UPROPERTY(EditDefaultsOnly, Category = "KBVE|Server")
	float SlimeSpawnRadius = 600.0f;
};
