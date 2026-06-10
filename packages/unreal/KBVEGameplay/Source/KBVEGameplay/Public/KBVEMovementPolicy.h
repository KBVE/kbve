#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "GameplayTagContainer.h"
#include "KBVEMovementPolicy.generated.h"

/** Which movement backend an agent should use. The policy picks; a spawner maps to a concrete class. */
UENUM(BlueprintType)
enum class EKBVEMovementBackend : uint8
{
	// Battle-tested CharacterMovementComponent — hero / combat avatars.
	CMC,
	// UE5 Mover — peaceful high-population agents, vehicles/physics movement.
	Mover,
	// Mass ECS + replicated snapshots — crowds, distant / ambient agents.
	Mass
};

/** Situation an agent is spawned/evaluated in. Backend-agnostic inputs to the policy. */
USTRUCT(BlueprintType)
struct FKBVEMovementContext
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Movement")
	bool bInCombat = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Movement")
	int32 LocalPopulation = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Movement")
	float DistanceToViewer = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Movement")
	bool bIsPlayerControlled = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Movement")
	FGameplayTag ZoneType;
};

/**
 * Resolves a movement backend from a situation. Returns an enum only — it never
 * references the Mover/CMC/Mass plugins, so KBVEGameplay stays backend-agnostic.
 * The consuming spawner maps EKBVEMovementBackend → a concrete pawn/entity class.
 * Override ResolveBackend (C++ or Blueprint) for game-specific rules.
 */
UCLASS(BlueprintType, Blueprintable)
class KBVEGAMEPLAY_API UKBVEMovementPolicy : public UDataAsset
{
	GENERATED_BODY()

public:
	/** Beyond this distance, agents drop to Mass (ghost/crowd). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Movement", meta = (ClampMin = "0.0"))
	float FarDistance = 8000.0f;

	/** At or above this local population (and peaceful), non-player agents use Mover. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Movement", meta = (ClampMin = "1"))
	int32 CrowdPopulationThreshold = 50;

	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "KBVE|Movement")
	EKBVEMovementBackend ResolveBackend(const FKBVEMovementContext& Context) const;
	virtual EKBVEMovementBackend ResolveBackend_Implementation(const FKBVEMovementContext& Context) const;
};
