#include "chuckSimgridGameMode.h"
#include "chuckSimgridController.h"
#include "chuckArpgPawn.h"

AchuckSimgridGameMode::AchuckSimgridGameMode()
{
	PlayerControllerClass = AchuckSimgridController::StaticClass();
	DefaultPawnClass = AchuckArpgPawn::StaticClass();
}
