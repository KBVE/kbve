#include "chuckCombatGameMode.h"
#include "chuckCombatCharacter.h"

AchuckCombatGameMode::AchuckCombatGameMode()
{
	DefaultPawnClass = AchuckCombatCharacter::StaticClass();
}
