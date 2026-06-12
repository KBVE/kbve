#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "chuckSlimeNetActor.generated.h"

class UKBVENetEntityReplicator;

/**
 * Always-relevant replicated holder for the slime snapshot stream. The server
 * spawns one; clients find it and read its UKBVENetEntityReplicator to render
 * the swarm locally. Carries no transform of its own.
 */
UCLASS()
class AchuckSlimeNetActor : public AActor
{
	GENERATED_BODY()

public:
	AchuckSlimeNetActor();

	UKBVENetEntityReplicator* GetReplicator() const { return Replicator; }

private:
	UPROPERTY()
	TObjectPtr<UKBVENetEntityReplicator> Replicator;
};
