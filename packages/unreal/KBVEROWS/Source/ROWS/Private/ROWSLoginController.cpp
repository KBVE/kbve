#include "ROWSLoginController.h"
#include "ROWSSubsystem.h"
#include "ROWSAuthSubsystem.h"
#include "ROWSCharacterSubsystem.h"
#include "ROWSLoginWidget.h"
#include "ROWSLoadingWidget.h"
#include "Kismet/GameplayStatics.h"

AROWSLoginController::AROWSLoginController()
{
}

void AROWSLoginController::BeginPlay()
{
	Super::BeginPlay();

	if (!IsLocalController()) return;

	Core = GetGameInstance()->GetSubsystem<UROWSSubsystem>();
	Auth = GetGameInstance()->GetSubsystem<UROWSAuthSubsystem>();
	Characters = GetGameInstance()->GetSubsystem<UROWSCharacterSubsystem>();

	if (Auth)
	{
		Auth->OnLoginSuccess.AddDynamic(this, &AROWSLoginController::HandleLoginSuccess);
		Auth->OnLoginError.AddDynamic(this, &AROWSLoginController::HandleLoginError);
		Auth->OnLogoutSuccess.AddDynamic(this, &AROWSLoginController::HandleLogoutSuccess);
		Auth->OnLogoutError.AddDynamic(this, &AROWSLoginController::HandleLogoutError);
	}

	if (Characters)
	{
		Characters->OnGetCharactersSuccess.AddDynamic(this, &AROWSLoginController::HandleGetCharactersSuccess);
		Characters->OnGetCharactersError.AddDynamic(this, &AROWSLoginController::HandleGetCharactersError);
	}

	ShowLoginScreen();
	OnLoginFlowStarted();
}

void AROWSLoginController::HideAllWidgets()
{
	if (LoginWidget) { LoginWidget->RemoveFromParent(); }
	if (LoadingWidget) { LoadingWidget->RemoveFromParent(); }
}

void AROWSLoginController::ShowLoginScreen()
{
	HideAllWidgets();

	if (!LoginWidget)
	{
		if (LoginWidgetClass)
		{
			LoginWidget = CreateWidget<UROWSLoginWidget>(this, LoginWidgetClass);
		}
		else
		{
			LoginWidget = CreateWidget<UROWSLoginWidget>(this, UROWSLoginWidget::StaticClass());
		}
	}

	if (LoginWidget)
	{
		LoginWidget->AddToViewport();
		FInputModeUIOnly InputMode;
		InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		SetInputMode(InputMode);
		SetShowMouseCursor(true);
	}
}

void AROWSLoginController::ShowCharacterSelect()
{
	if (Characters && !UserSessionGUID.IsEmpty())
	{
		Characters->GetAllCharacters(UserSessionGUID);
	}
}

void AROWSLoginController::ShowLoadingScreen(const FString& StatusMessage)
{
	HideAllWidgets();

	if (!LoadingWidget)
	{
		if (LoadingWidgetClass)
		{
			LoadingWidget = CreateWidget<UROWSLoadingWidget>(this, LoadingWidgetClass);
		}
		else
		{
			LoadingWidget = CreateWidget<UROWSLoadingWidget>(this, UROWSLoadingWidget::StaticClass());
		}
	}

	if (LoadingWidget)
	{
		LoadingWidget->SetStatus(StatusMessage);
		LoadingWidget->AddToViewport();
	}
}

void AROWSLoginController::OnLoginSuccess(const FString& InUserSessionGUID)
{
	UE_LOG(LogROWS, Log, TEXT("AROWSLoginController::OnLoginSuccess — GUID=%s"), *InUserSessionGUID);
	UserSessionGUID = InUserSessionGUID;
	ShowCharacterSelect();
}

void AROWSLoginController::OnPlayClicked(const FString& CharacterName)
{
	SelectedCharacterName = CharacterName;
	UE_LOG(LogROWS, Log, TEXT("AROWSLoginController::OnPlayClicked — Character=%s"), *SelectedCharacterName);

	ShowLoadingScreen(TEXT("Connecting to server..."));

	FInputModeUIOnly InputMode;
	InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
	SetInputMode(InputMode);
	SetShowMouseCursor(true);

	FCoreUObjectDelegates::PreLoadMap.AddWeakLambda(this, [this](const FString& MapName)
	{
		FInputModeGameOnly GameInput;
		SetInputMode(GameInput);
		SetShowMouseCursor(false);
	});

	OnTravelStarted();

	// TODO: When ROWS supports zone routing, use GetServerToConnectTo + ClientTravel here.
	UGameplayStatics::OpenLevel(this, GameMapName, true);
}

void AROWSLoginController::OnLogout()
{
	if (Auth && !UserSessionGUID.IsEmpty())
	{
		Auth->Logout(UserSessionGUID);
	}
	else
	{
		UserSessionGUID.Empty();
		SelectedCharacterName.Empty();
		ShowLoginScreen();
	}
}

// ---------------------------------------------------------------------------
// Delegate Handlers
// ---------------------------------------------------------------------------

void AROWSLoginController::HandleLoginSuccess(const FString& InUserSessionGUID)
{
	OnLoginSuccess(InUserSessionGUID);
}

void AROWSLoginController::HandleLoginError(const FString& ErrorMessage)
{
	UE_LOG(LogROWS, Error, TEXT("Login failed: %s"), *ErrorMessage);
}

void AROWSLoginController::HandleGetCharactersSuccess(const TArray<FROWSUserCharacter>& InCharacters)
{
	UE_LOG(LogROWS, Log, TEXT("Got %d character(s)"), InCharacters.Num());
	OnCharacterSelectReady(InCharacters.Num());
}

void AROWSLoginController::HandleGetCharactersError(const FString& ErrorMessage)
{
	UE_LOG(LogROWS, Error, TEXT("GetAllCharacters failed: %s"), *ErrorMessage);
}

void AROWSLoginController::HandleLogoutSuccess()
{
	UserSessionGUID.Empty();
	SelectedCharacterName.Empty();
	ShowLoginScreen();
}

void AROWSLoginController::HandleLogoutError(const FString& ErrorMessage)
{
	UE_LOG(LogROWS, Error, TEXT("Logout failed: %s — returning to login"), *ErrorMessage);
	UserSessionGUID.Empty();
	SelectedCharacterName.Empty();
	ShowLoginScreen();
}
