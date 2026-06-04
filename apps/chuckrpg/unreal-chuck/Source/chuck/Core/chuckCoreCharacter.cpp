#include "chuckCoreCharacter.h"

#include "InputAction.h"
#include "UObject/ConstructorHelpers.h"

AchuckCoreCharacter::AchuckCoreCharacter()
{
	static ConstructorHelpers::FObjectFinder<UInputAction> IA_Jump(
		TEXT("/Game/Input/Actions/IA_Jump.IA_Jump"));
	static ConstructorHelpers::FObjectFinder<UInputAction> IA_Move(
		TEXT("/Game/Input/Actions/IA_Move.IA_Move"));
	static ConstructorHelpers::FObjectFinder<UInputAction> IA_Look(
		TEXT("/Game/Input/Actions/IA_Look.IA_Look"));
	static ConstructorHelpers::FObjectFinder<UInputAction> IA_MouseLook(
		TEXT("/Game/Input/Actions/IA_MouseLook.IA_MouseLook"));

	if (IA_Jump.Succeeded())      JumpAction      = IA_Jump.Object;
	if (IA_Move.Succeeded())      MoveAction      = IA_Move.Object;
	if (IA_Look.Succeeded())      LookAction      = IA_Look.Object;
	if (IA_MouseLook.Succeeded()) MouseLookAction = IA_MouseLook.Object;
}
