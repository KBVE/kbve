// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ShooterNPCSpawner.generated.h"

class UCapsuleComponent;
class UArrowComponent;
class AShooterNPC;

/**
 *  A basic Actor in charge of spawning Shooter NPCs and monitoring their deaths.
 *  NPCs will be spawned one by one, and the spawner will wait until it dies before spawning a new one.
 */
UCLASS()
class UNREALCLEANROOM_API AShooterNPCSpawner : public AActor
{
	GENERATED_BODY()
	
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Components", meta = (AllowPrivateAccess = "true"))
	UCapsuleComponent* SpawnCapsule;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components", meta = (AllowPrivateAccess = "true"))
	UArrowComponent* SpawnDirection;

protected:

	/** Type of NPC to spawn */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="NPC Spawner")
	TSubclassOf<AShooterNPC> NPCClass;

	/** Time to wait before spawning the first NPC on game start */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="NPC Spawner", meta = (ClampMin = 0, ClampMax = 10))
	float InitialSpawnDelay = 5.0f;

	/** Number of NPCs to spawn */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="NPC Spawner", meta = (ClampMin = 0, ClampMax = 100))
	int32 SpawnCount = 1;

	/** Time to wait before spawning the next NPC after the current one dies */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="NPC Spawner", meta = (ClampMin = 0, ClampMax = 10))
	float RespawnDelay = 5.0f;

	/** Timer to spawn NPCs after a delay */
	FTimerHandle SpawnTimer;

public:	
	
	/** Constructor */
	AShooterNPCSpawner();

public:

	/** Initialization */
	virtual void BeginPlay() override;

	/** Cleanup */
	virtual void EndPlay(EEndPlayReason::Type EndPlayReason) override;

protected:

	/** Spawn an NPC and subscribe to its death event */
	void SpawnNPC();

	/** Called when the spawned NPC has died */
	UFUNCTION()
	void OnNPCDied();

};
