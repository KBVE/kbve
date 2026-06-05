#include "chuckMenuPlayerController.h"

#include "SchuckMainMenu.h"
#include "SchuckLoginWidget.h"
#include "SchuckAccountPanel.h"
#include "Engine/GameInstance.h"
#include "Engine/GameViewportClient.h"
#include "Engine/LocalPlayer.h"
#include "Engine/World.h"
#include "Framework/Application/SlateApplication.h"
#include "KBVESupabaseSubsystem.h"
#include "KBVESupabaseTypes.h"
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

	if (UGameInstance* GI = GetGameInstance())
	{
		SupabaseSubsystem = GI->GetSubsystem<UKBVESupabaseSubsystem>();
	}

	MenuWidget = SNew(SchuckMainMenu)
		.OnPlayClicked(FSimpleDelegate::CreateUObject(this, &AchuckMenuPlayerController::HandlePlay))
		.OnQuitClicked(FSimpleDelegate::CreateUObject(this, &AchuckMenuPlayerController::HandleQuit));

	LoginWidget   = SNew(SchuckLoginWidget).Subsystem(SupabaseSubsystem);
	AccountWidget = SNew(SchuckAccountPanel).Subsystem(SupabaseSubsystem);

	if (UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr)
	{
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), MenuWidget.ToSharedRef(),    10);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), AccountWidget.ToSharedRef(), 40);
		Viewport->AddViewportWidgetForPlayer(GetLocalPlayer(), LoginWidget.ToSharedRef(),   45);
	}

	if (UKBVESupabaseSubsystem* Sub = SupabaseSubsystem.Get())
	{
		Sub->OnSignedIn.AddDynamic(this, &AchuckMenuPlayerController::HandleSupabaseSignedIn);
		Sub->OnSignedOut.AddDynamic(this, &AchuckMenuPlayerController::HandleSupabaseSignedOut);
		Sub->OnSessionRefreshed.AddDynamic(this, &AchuckMenuPlayerController::HandleSupabaseSessionRefreshed);
		const bool bSignedIn = Sub->IsSignedIn();
		if (bSignedIn)
		{
			ApplyAccountFromSession(Sub->GetSession());
			Sub->FetchUser();
		}
		RefreshAuthVisibility(bSignedIn);
	}
	else
	{
		RefreshAuthVisibility(false);
	}

	FInputModeUIOnly InputMode;
	InputMode.SetWidgetToFocus(MenuWidget);
	InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
	SetInputMode(InputMode);
}

void AchuckMenuPlayerController::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (UKBVESupabaseSubsystem* Sub = SupabaseSubsystem.Get())
	{
		Sub->OnSignedIn.RemoveAll(this);
		Sub->OnSignedOut.RemoveAll(this);
		Sub->OnSessionRefreshed.RemoveAll(this);
	}

	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
	if (LoginWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), LoginWidget.ToSharedRef());
		LoginWidget.Reset();
	}
	if (AccountWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), AccountWidget.ToSharedRef());
		AccountWidget.Reset();
	}
	if (MenuWidget.IsValid())
	{
		if (Viewport) Viewport->RemoveViewportWidgetForPlayer(GetLocalPlayer(), MenuWidget.ToSharedRef());
		MenuWidget.Reset();
	}
	Super::EndPlay(EndPlayReason);
}

void AchuckMenuPlayerController::HandlePlay()
{
	UKBVESupabaseSubsystem* Sub = SupabaseSubsystem.Get();
	if (!Sub || !Sub->IsSignedIn())
	{
		RefreshAuthVisibility(false);
		if (LoginWidget.IsValid())
		{
			FInputModeUIOnly Mode;
			Mode.SetWidgetToFocus(LoginWidget);
			Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
			SetInputMode(Mode);
		}
		return;
	}

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

void AchuckMenuPlayerController::HandleSupabaseSignedIn(const FKBVESupabaseSession& Session)
{
	ApplyAccountFromSession(Session);
	RefreshAuthVisibility(true);
	if (UKBVESupabaseSubsystem* Sub = SupabaseSubsystem.Get())
	{
		Sub->FetchUser();
	}
	if (MenuWidget.IsValid())
	{
		FInputModeUIOnly Mode;
		Mode.SetWidgetToFocus(MenuWidget);
		Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		SetInputMode(Mode);
		FSlateApplication::Get().SetKeyboardFocus(MenuWidget, EFocusCause::SetDirectly);
	}
}

void AchuckMenuPlayerController::HandleSupabaseSessionRefreshed(const FKBVESupabaseSession& Session)
{
	ApplyAccountFromSession(Session);
}

void AchuckMenuPlayerController::ApplyAccountFromSession(const FKBVESupabaseSession& Session)
{
	if (!AccountWidget.IsValid()) return;
	const FKBVESupabaseUser& U = Session.User;
	FString DisplayName = U.KbveUsername;
	if (DisplayName.IsEmpty()) DisplayName = U.Email;
	if (DisplayName.IsEmpty()) DisplayName = U.Id;
	AccountWidget->SetUsername(DisplayName);

	FString AvatarURL;
	if (const FString* Found = U.UserMetadata.Find(TEXT("avatar_url")))      AvatarURL = *Found;
	else if (const FString* Pic = U.UserMetadata.Find(TEXT("picture")))      AvatarURL = *Pic;
	else if (const FString* App = U.AppMetadata.Find(TEXT("avatar_url")))    AvatarURL = *App;
	if (!AvatarURL.IsEmpty())
	{
		AccountWidget->SetAvatarURL(AvatarURL);
	}
}

void AchuckMenuPlayerController::HandleSupabaseSignedOut()
{
	RefreshAuthVisibility(false);
}

void AchuckMenuPlayerController::RefreshAuthVisibility(bool bSignedIn)
{
	if (LoginWidget.IsValid())
	{
		LoginWidget->SetVisibility(bSignedIn ? EVisibility::Collapsed : EVisibility::Visible);
	}
	if (AccountWidget.IsValid())
	{
		AccountWidget->SetVisibility(bSignedIn ? EVisibility::Visible : EVisibility::Collapsed);
	}
}
