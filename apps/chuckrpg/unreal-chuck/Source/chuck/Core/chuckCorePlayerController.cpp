#include "chuckCorePlayerController.h"

#include "chuckCoreCharacter.h"
#include "chuckHUDState.h"
#include "chuckInputs.h"
#include "EnhancedInputComponent.h"
#include "Engine/GameViewportClient.h"
#include "Engine/LocalPlayer.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "chuckEventPayloads.h"
#include "chuckUIEvents.h"
#include "SchuckDevOverlay.h"
#include "SchuckHotbar.h"
#include "SchuckHUD.h"
#include "SchuckInventoryWindow.h"
#include "SchuckPauseMenu.h"
#include "SKBVETooltip.h"

AchuckCorePlayerController::AchuckCorePlayerController()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;
}

void AchuckCorePlayerController::PostInitializeComponents()
{
	Super::PostInitializeComponents();

	if (UchuckInputs* Inputs = UchuckInputs::Get())
	{
		DefaultMappingContexts.Reset();
		MobileExcludedMappingContexts.Reset();
		if (Inputs->DefaultIMC)
		{
			DefaultMappingContexts.Add(Inputs->DefaultIMC);
		}
	}
}

void AchuckCorePlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();

	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(InputComponent))
	{
		if (UchuckInputs* Inputs = UchuckInputs::Get())
		{
			if (Inputs->Pause)
			{
				EIC->BindAction(Inputs->Pause, ETriggerEvent::Started, this, &AchuckCorePlayerController::OnPausePressed);
			}
			if (Inputs->ToggleDevOverlay)
			{
				EIC->BindAction(Inputs->ToggleDevOverlay, ETriggerEvent::Started, this, &AchuckCorePlayerController::OnToggleDevOverlayPressed);
			}
			if (Inputs->Inventory)
			{
				EIC->BindAction(Inputs->Inventory, ETriggerEvent::Started, this, &AchuckCorePlayerController::OnInventoryPressed);
			}
		}
	}
}

void AchuckCorePlayerController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);

	if (!IsLocalPlayerController())
	{
		return;
	}

	AchuckCoreCharacter* Char = Cast<AchuckCoreCharacter>(InPawn);
	if (!Char)
	{
		return;
	}

	if (HUDWidget.IsValid())
	{
		return;
	}

	HUDWidget    = SNew(SchuckHUD).OwningCharacter(Char);
	HotbarWidget = SNew(SchuckHotbar).OwningCharacter(Char);
	TooltipWidget = SNew(SKBVETooltip);

	if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
	{
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), HUDWidget.ToSharedRef(),     5);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), HotbarWidget.ToSharedRef(),  6);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), TooltipWidget.ToSharedRef(), 30);
	}

	if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
	{
		FKBVEEventHandle H = Bus->Tooltip.Subscribe(this, [this](const FchuckTooltipPayload& P)
		{
			if (!TooltipWidget.IsValid()) return;
			if (P.bShow) TooltipWidget->Show(P.Text, P.ScreenPos);
			else         TooltipWidget->Hide();
		});
		TooltipHandleId = H.Id;
	}
}

void AchuckCorePlayerController::OnUnPossess()
{
	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;

	if (TooltipHandleId != 0)
	{
		if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
		{
			Bus->Tooltip.Unsubscribe({ TooltipHandleId });
		}
		TooltipHandleId = 0;
	}
	if (TooltipWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), TooltipWidget.ToSharedRef());
		TooltipWidget.Reset();
	}
	if (InventoryWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), InventoryWidget.ToSharedRef());
		InventoryWidget.Reset();
		bInventoryOpen = false;
	}
	if (HotbarWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), HotbarWidget.ToSharedRef());
		HotbarWidget.Reset();
	}
	if (HUDWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), HUDWidget.ToSharedRef());
		HUDWidget.Reset();
	}
	Super::OnUnPossess();
}

void AchuckCorePlayerController::OnPausePressed(const FInputActionValue& Value)
{
	if (bGamePaused)
	{
		ResumeGame();
	}
	else
	{
		PauseGame();
	}
}

void AchuckCorePlayerController::PauseGame()
{
	if (bGamePaused)
	{
		return;
	}
	bGamePaused = true;

	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
	if (!Viewport)
	{
		return;
	}

	PauseWidget = SNew(SchuckPauseMenu)
		.OnResumeClicked    (FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::ResumeGame))
		.OnQuitToMenuClicked(FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::QuitToMainMenu))
		.OnQuitClicked      (FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::QuitGame));

	Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), PauseWidget.ToSharedRef(), 20);

	FInputModeUIOnly Mode;
	Mode.SetWidgetToFocus(PauseWidget);
	Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
	SetInputMode(Mode);
	bShowMouseCursor = true;

	SetPause(true);
}

void AchuckCorePlayerController::ResumeGame()
{
	if (!bGamePaused)
	{
		return;
	}
	bGamePaused = false;

	if (PauseWidget.IsValid())
	{
		if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
		{
			Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), PauseWidget.ToSharedRef());
		}
		PauseWidget.Reset();
	}

	SetPause(false);
	SetInputMode(FInputModeGameOnly());
	bShowMouseCursor = false;
}

void AchuckCorePlayerController::QuitToMainMenu()
{
	SetPause(false);
	UGameplayStatics::OpenLevel(this, MainMenuLevelName);
}

void AchuckCorePlayerController::QuitGame()
{
	UKismetSystemLibrary::QuitGame(this, this, EQuitPreference::Quit, false);
}

void AchuckCorePlayerController::OnToggleDevOverlayPressed(const FInputActionValue& Value)
{
	bDevOverlayShown = !bDevOverlayShown;

	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
	if (!Viewport)
	{
		return;
	}

	if (bDevOverlayShown)
	{
		DevOverlayWidget = SNew(SchuckDevOverlay).OwningController(this);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), DevOverlayWidget.ToSharedRef(), 15);
	}
	else if (DevOverlayWidget.IsValid())
	{
		Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), DevOverlayWidget.ToSharedRef());
		DevOverlayWidget.Reset();
	}
}

void AchuckCorePlayerController::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
}

void AchuckCorePlayerController::OnInventoryPressed(const FInputActionValue& Value)
{
	UE_LOG(LogTemp, Display, TEXT("[chuck] Inventory key pressed (currently %s)"),
		bInventoryOpen ? TEXT("open") : TEXT("closed"));
	if (bInventoryOpen) CloseInventory();
	else                OpenInventory();
}

void AchuckCorePlayerController::OpenInventory()
{
	if (bInventoryOpen) return;
	AchuckCoreCharacter* Char = Cast<AchuckCoreCharacter>(GetPawn());
	if (!Char) return;

	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
	if (!Viewport) return;

	InventoryWidget = SNew(SchuckInventoryWindow)
		.OwningCharacter(Char)
		.OnCloseClicked(FSimpleDelegate::CreateUObject(this, &AchuckCorePlayerController::CloseInventory));
	Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), InventoryWidget.ToSharedRef(), 12);

	FInputModeGameAndUI Mode;
	Mode.SetWidgetToFocus(InventoryWidget);
	Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
	SetInputMode(Mode);
	bShowMouseCursor = true;
	bInventoryOpen   = true;
}

void AchuckCorePlayerController::CloseInventory()
{
	if (!bInventoryOpen) return;

	if (InventoryWidget.IsValid())
	{
		if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
		{
			Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), InventoryWidget.ToSharedRef());
		}
		InventoryWidget.Reset();
	}

	SetInputMode(FInputModeGameOnly());
	bShowMouseCursor = false;
	bInventoryOpen   = false;
}
