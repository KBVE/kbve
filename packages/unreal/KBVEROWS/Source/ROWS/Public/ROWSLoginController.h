#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "ROWSTypes.h"
#include "ROWSLoginController.generated.h"

class UROWSSubsystem;
class UROWSAuthSubsystem;
class UROWSCharacterSubsystem;
class UROWSLoginWidget;
class UROWSLoadingWidget;

/**
 * AROWSLoginController
 *
 * Orchestrates: Login Screen -> Character Select -> Loading -> Travel to Game Map
 * Mirrors ChuckLoginController — create-once widgets, HideAllWidgets, delegates to ROWS subsystems.
 */
UCLASS()
class ROWS_API AROWSLoginController : public APlayerController
{
	GENERATED_BODY()

public:
	AROWSLoginController();
	virtual void BeginPlay() override;

	// Widget classes (set in Blueprint Class Defaults)
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "ROWS|Widgets")
	TSubclassOf<UROWSLoginWidget> LoginWidgetClass;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "ROWS|Widgets")
	TSubclassOf<UROWSLoadingWidget> LoadingWidgetClass;

	// Active widget instances
	UPROPERTY(BlueprintReadOnly, Category = "ROWS")
	TObjectPtr<UROWSLoginWidget> LoginWidget;

	UPROPERTY(BlueprintReadOnly, Category = "ROWS")
	TObjectPtr<UROWSLoadingWidget> LoadingWidget;

	// Session
	UPROPERTY(BlueprintReadWrite, Category = "ROWS")
	FString UserSessionGUID;

	UPROPERTY(BlueprintReadWrite, Category = "ROWS")
	FString SelectedCharacterName;

	// Screen management
	UFUNCTION(BlueprintCallable, Category = "ROWS")
	void ShowLoginScreen();

	UFUNCTION(BlueprintCallable, Category = "ROWS")
	void ShowCharacterSelect();

	UFUNCTION(BlueprintCallable, Category = "ROWS")
	void ShowLoadingScreen(const FString& StatusMessage);

	UFUNCTION(BlueprintCallable, Category = "ROWS")
	void OnLoginSuccess(const FString& InUserSessionGUID);

	UFUNCTION(BlueprintCallable, Category = "ROWS")
	void OnPlayClicked(const FString& CharacterName);

	UFUNCTION(BlueprintCallable, Category = "ROWS")
	void OnLogout();

	// Map to travel to after login
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "ROWS|Config")
	FName GameMapName = FName(TEXT("Lvl_TopDown"));

	// Blueprint events
	UFUNCTION(BlueprintImplementableEvent, Category = "ROWS")
	void OnLoginFlowStarted();

	UFUNCTION(BlueprintImplementableEvent, Category = "ROWS")
	void OnCharacterSelectReady(int32 CharacterCount);

	UFUNCTION(BlueprintImplementableEvent, Category = "ROWS")
	void OnTravelStarted();

protected:
	UPROPERTY()
	TObjectPtr<UROWSSubsystem> Core;

	UPROPERTY()
	TObjectPtr<UROWSAuthSubsystem> Auth;

	UPROPERTY()
	TObjectPtr<UROWSCharacterSubsystem> Characters;

private:
	void HideAllWidgets();

	UFUNCTION()
	void HandleLoginSuccess(const FString& InUserSessionGUID);
	UFUNCTION()
	void HandleLoginError(const FString& ErrorMessage);
	UFUNCTION()
	void HandleGetCharactersSuccess(const TArray<FROWSUserCharacter>& InCharacters);
	UFUNCTION()
	void HandleGetCharactersError(const FString& ErrorMessage);
	UFUNCTION()
	void HandleLogoutSuccess();
	UFUNCTION()
	void HandleLogoutError(const FString& ErrorMessage);
};
