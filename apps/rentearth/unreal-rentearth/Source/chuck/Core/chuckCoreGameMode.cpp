#include "chuckCoreGameMode.h"

#include "chuckCorePlayerController.h"
#include "chuckCoreCharacter.h"

AchuckCoreGameMode::AchuckCoreGameMode()
{
	PlayerControllerClass = AchuckCorePlayerController::StaticClass();
	DefaultPawnClass      = AchuckCoreCharacter::StaticClass();
}
