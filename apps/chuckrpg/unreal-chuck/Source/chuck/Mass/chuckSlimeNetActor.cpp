#include "chuckSlimeNetActor.h"
#include "KBVENetEntityReplicator.h"

AchuckSlimeNetActor::AchuckSlimeNetActor()
{
	PrimaryActorTick.bCanEverTick = false;
	bReplicates = true;
	bAlwaysRelevant = true;
	SetReplicateMovement(false);

	Replicator = CreateDefaultSubobject<UKBVENetEntityReplicator>(TEXT("SlimeReplicator"));
}
