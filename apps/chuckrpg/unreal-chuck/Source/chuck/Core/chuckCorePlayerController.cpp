#include "chuckCorePlayerController.h"

#include "chuckCoreCharacter.h"
#include "chuckHUDState.h"
#include "chuckInputs.h"
#include "SchuckHUD.h"
#include "Engine/GameViewportClient.h"
#include "Engine/LocalPlayer.h"
#include "Engine/World.h"

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

	HUDWidget = SNew(SchuckHUD);

	if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
	{
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), HUDWidget.ToSharedRef(), 5);
	}
}

void AchuckCorePlayerController::OnUnPossess()
{
	if (HUDWidget.IsValid())
	{
		if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
		{
			Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), HUDWidget.ToSharedRef());
		}
		HUDWidget.Reset();
	}
	Super::OnUnPossess();
}

void AchuckCorePlayerController::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (!HUDWidget.IsValid())
	{
		return;
	}

	AchuckCoreCharacter* Char = Cast<AchuckCoreCharacter>(GetPawn());
	if (!Char)
	{
		return;
	}

	FchuckHUDState State;
	State.HealthPercent  = Char->GetStats().HealthFraction();
	State.ManaPercent    = Char->GetStats().ManaFraction();
	State.StaminaPercent = Char->GetStats().StaminaFraction();
	State.TimeSeconds    = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.f;

	HUDWidget->SetState(State);
}
