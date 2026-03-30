#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/EditableTextBox.h"
#include "Components/Button.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/Overlay.h"
#include "Components/WidgetSwitcher.h"
#include "ROWSTypes.h"
#include "ROWSLoginWidget.generated.h"

class UROWSAuthSubsystem;

/**
 * UROWSLoginWidget
 *
 * Full C++ login widget — email/password fields, login/register buttons,
 * panel switcher, status text. All built in RebuildWidget().
 * Every element is BlueprintReadOnly for restyling in child BPs.
 */
UCLASS()
class ROWS_API UROWSLoginWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	virtual TSharedRef<SWidget> RebuildWidget() override;
	virtual void NativeConstruct() override;
	virtual void NativeDestruct() override;

	// Auth actions
	UFUNCTION(BlueprintCallable, Category = "ROWS") void LoginAndCreateSession(const FString& Email, const FString& Password);
	UFUNCTION(BlueprintCallable, Category = "ROWS") void ExternalLoginAndCreateSession(const FString& ExternalLoginToken);
	UFUNCTION(BlueprintCallable, Category = "ROWS") void Register(const FString& Email, const FString& Password, const FString& FirstName, const FString& LastName);
	UFUNCTION(BlueprintCallable, Category = "ROWS") void Logout();

	// Panel switching
	UFUNCTION(BlueprintCallable, Category = "ROWS|UI") void ShowLoginPanel();
	UFUNCTION(BlueprintCallable, Category = "ROWS|UI") void ShowRegisterPanel();

	// Blueprint events
	UFUNCTION(BlueprintImplementableEvent, Category = "ROWS") void NotifyLoginSuccess(const FString& UserSessionGUID);
	UFUNCTION(BlueprintImplementableEvent, Category = "ROWS") void NotifyLoginError(const FString& ErrorMessage);
	UFUNCTION(BlueprintImplementableEvent, Category = "ROWS") void NotifyRegisterSuccess(const FString& UserSessionGUID);
	UFUNCTION(BlueprintImplementableEvent, Category = "ROWS") void NotifyRegisterError(const FString& ErrorMessage);
	UFUNCTION(BlueprintImplementableEvent, Category = "ROWS") void NotifyLogoutSuccess();
	UFUNCTION(BlueprintImplementableEvent, Category = "ROWS") void NotifyLogoutError(const FString& ErrorMessage);

	// UI elements (accessible from Blueprint)
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UOverlay> RootOverlay;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UVerticalBox> FormContainer;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UWidgetSwitcher> PanelSwitcher;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UTextBlock> TitleText;

	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UVerticalBox> LoginPanel;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UEditableTextBox> LoginEmailField;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UEditableTextBox> LoginPasswordField;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UButton> LoginButton;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UTextBlock> LoginButtonText;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UButton> SwitchToRegisterButton;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UTextBlock> SwitchToRegisterText;

	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UVerticalBox> RegisterPanel;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UEditableTextBox> RegisterEmailField;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UEditableTextBox> RegisterPasswordField;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UEditableTextBox> RegisterFirstNameField;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UEditableTextBox> RegisterLastNameField;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UButton> RegisterButton;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UTextBlock> RegisterButtonText;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UButton> SwitchToLoginButton;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UTextBlock> SwitchToLoginText;

	UPROPERTY(BlueprintReadOnly, Category = "ROWS|UI") TObjectPtr<UTextBlock> StatusText;

protected:
	UPROPERTY() TObjectPtr<UROWSAuthSubsystem> AuthSubsystem;

	UVerticalBox* BuildLoginPanel();
	UVerticalBox* BuildRegisterPanel();
	UEditableTextBox* CreateTextField(const FString& HintText, bool bIsPassword = false);
	UButton* CreateButton(const FString& Label, TObjectPtr<UTextBlock>& OutTextBlock);
	void SetStatusMessage(const FString& Message, FLinearColor Color = FLinearColor::White);

	bool bWidgetsCreated = false;

private:
	UFUNCTION() void OnLoginButtonClicked();
	UFUNCTION() void OnRegisterButtonClicked();
	UFUNCTION() void OnSwitchToRegisterClicked();
	UFUNCTION() void OnSwitchToLoginClicked();

	UFUNCTION() void HandleLoginSuccess(const FString& UserSessionGUID);
	UFUNCTION() void HandleLoginError(const FString& ErrorMessage);
	UFUNCTION() void HandleRegisterSuccess(const FString& UserSessionGUID);
	UFUNCTION() void HandleRegisterError(const FString& ErrorMessage);
	UFUNCTION() void HandleLogoutSuccess();
	UFUNCTION() void HandleLogoutError(const FString& ErrorMessage);
};
