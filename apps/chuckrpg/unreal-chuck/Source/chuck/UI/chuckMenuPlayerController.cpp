#include "chuckMenuPlayerController.h"

#include "SchuckMainMenu.h"
#include "Engine/GameViewportClient.h"
#include "Engine/LocalPlayer.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"

AchuckMenuPlayerController::AchuckMenuPlayerController()
{
	bShowMouseCursor = true;
	bEnableClickEvents = true;
	bEnableMouseOverEvents = true;
}

void AchuckMenuPlayerController::BeginPlay()
{
	Super::BeginPlay();

	MenuWidget = SNew(SchuckMainMenu)
		.OnPlayClicked(FSimpleDelegate::CreateUObject(this, &AchuckMenuPlayerController::HandlePlay))
		.OnQuitClicked(FSimpleDelegate::CreateUObject(this, &AchuckMenuPlayerController::HandleQuit));

	if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
	{
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), MenuWidget.ToSharedRef(), 10);
	}

	FInputModeUIOnly InputMode;
	InputMode.SetWidgetToFocus(MenuWidget);
	InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
	SetInputMode(InputMode);
}

void AchuckMenuPlayerController::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (MenuWidget.IsValid())
	{
		if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
		{
			Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), MenuWidget.ToSharedRef());
		}
		MenuWidget.Reset();
	}
	Super::EndPlay(EndPlayReason);
}

void AchuckMenuPlayerController::HandlePlay()
{
	if (PlayLevelName.IsNone())
	{
		return;
	}

	bShowMouseCursor = false;
	SetInputMode(FInputModeGameOnly());

	UGameplayStatics::OpenLevel(this, PlayLevelName);
}

void AchuckMenuPlayerController::HandleQuit()
{
	UKismetSystemLibrary::QuitGame(this, this, EQuitPreference::Quit, false);
}
