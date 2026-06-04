#include "chuckCorePlayerController.h"

#include "InputMappingContext.h"
#include "UObject/ConstructorHelpers.h"

AchuckCorePlayerController::AchuckCorePlayerController()
{
	static ConstructorHelpers::FObjectFinder<UInputMappingContext> IMC_Default(
		TEXT("/Game/Input/IMC_Default.IMC_Default"));
	static ConstructorHelpers::FObjectFinder<UInputMappingContext> IMC_MouseLook(
		TEXT("/Game/Input/IMC_MouseLook.IMC_MouseLook"));

	if (IMC_Default.Succeeded())
	{
		DefaultMappingContexts.Add(IMC_Default.Object);
	}
	if (IMC_MouseLook.Succeeded())
	{
		MobileExcludedMappingContexts.Add(IMC_MouseLook.Object);
	}
}
