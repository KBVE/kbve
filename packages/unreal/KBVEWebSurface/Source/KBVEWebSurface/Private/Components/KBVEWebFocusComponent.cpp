#include "Components/KBVEWebFocusComponent.h"

#include "Blueprint/UserWidget.h"
#include "GameFramework/PlayerController.h"

UKBVEWebFocusComponent::UKBVEWebFocusComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UKBVEWebFocusComponent::EnterFocus(APlayerController* PC)
{
	if (!PC || bFocused)
	{
		return;
	}
	PC->bShowMouseCursor = true;
	PC->bEnableClickEvents = true;
	PC->bEnableMouseOverEvents = true;
	const FInputModeGameAndUI Mode;
	PC->SetInputMode(Mode);
	bFocused = true;
	OnFocusChanged.Broadcast(true);
}

void UKBVEWebFocusComponent::ExitFocus(APlayerController* PC)
{
	if (!PC || !bFocused)
	{
		return;
	}
	PC->bShowMouseCursor = false;
	PC->bEnableClickEvents = false;
	PC->bEnableMouseOverEvents = false;
	const FInputModeGameOnly Mode;
	PC->SetInputMode(Mode);
	bFocused = false;
	OnFocusChanged.Broadcast(false);
}
