#include "RareIconGameMode.h"

#include "Player/RareIconPlayerPawn.h"
#include "RareIcon.h"

ARareIconGameMode::ARareIconGameMode()
{
	bUseSeamlessTravel = true;
	DefaultPawnClass = ARareIconPlayerPawn::StaticClass();
}
