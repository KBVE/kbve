#include "chuckPlayerState.h"
#include "Net/UnrealNetwork.h"

void AchuckPlayerState::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AchuckPlayerState, CharacterName);
}
