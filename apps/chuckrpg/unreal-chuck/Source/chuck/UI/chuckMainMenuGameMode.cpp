#include "chuckMainMenuGameMode.h"

#include "chuckMenuPlayerController.h"
#include "GameFramework/SpectatorPawn.h"

AchuckMainMenuGameMode::AchuckMainMenuGameMode()
{
	PlayerControllerClass = AchuckMenuPlayerController::StaticClass();
	DefaultPawnClass = ASpectatorPawn::StaticClass();
}
