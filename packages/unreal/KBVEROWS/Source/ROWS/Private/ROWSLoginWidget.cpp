#include "ROWSLoginWidget.h"
#include "ROWSAuthSubsystem.h"
#include "ROWSSubsystem.h"
#include "Components/EditableTextBox.h"
#include "Components/Button.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Components/Overlay.h"
#include "Components/OverlaySlot.h"
#include "Components/WidgetSwitcher.h"
#include "Components/SizeBox.h"
#include "Components/Spacer.h"
#include "Blueprint/WidgetTree.h"

// ---------------------------------------------------------------------------
// RebuildWidget — widget tree built here, NOT NativeConstruct
// ---------------------------------------------------------------------------

TSharedRef<SWidget> UROWSLoginWidget::RebuildWidget()
{
	if (WidgetTree && !bWidgetsCreated)
	{
		bWidgetsCreated = true;

		RootOverlay = WidgetTree->ConstructWidget<UOverlay>(UOverlay::StaticClass(), TEXT("RootOverlay"));

		USizeBox* SizeBox = WidgetTree->ConstructWidget<USizeBox>(USizeBox::StaticClass(), TEXT("FormSizeBox"));
		SizeBox->SetMaxDesiredWidth(400.f);
		UOverlaySlot* SizeBoxSlot = RootOverlay->AddChildToOverlay(SizeBox);
		SizeBoxSlot->SetHorizontalAlignment(HAlign_Center);
		SizeBoxSlot->SetVerticalAlignment(VAlign_Center);

		FormContainer = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass(), TEXT("FormContainer"));
		SizeBox->AddChild(FormContainer);

		TitleText = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), TEXT("TitleText"));
		TitleText->SetText(FText::FromString(TEXT("ROWS Login")));
		FSlateFontInfo TitleFont = TitleText->GetFont();
		TitleFont.Size = 28;
		TitleText->SetFont(TitleFont);
		TitleText->SetJustification(ETextJustify::Center);
		UVerticalBoxSlot* TitleSlot = FormContainer->AddChildToVerticalBox(TitleText);
		TitleSlot->SetHorizontalAlignment(HAlign_Fill);
		TitleSlot->SetPadding(FMargin(0.f, 0.f, 0.f, 20.f));

		PanelSwitcher = WidgetTree->ConstructWidget<UWidgetSwitcher>(UWidgetSwitcher::StaticClass(), TEXT("PanelSwitcher"));
		UVerticalBoxSlot* SwitcherSlot = FormContainer->AddChildToVerticalBox(PanelSwitcher);
		SwitcherSlot->SetHorizontalAlignment(HAlign_Fill);

		LoginPanel = BuildLoginPanel();
		PanelSwitcher->AddChild(LoginPanel);
		RegisterPanel = BuildRegisterPanel();
		PanelSwitcher->AddChild(RegisterPanel);
		PanelSwitcher->SetActiveWidgetIndex(0);

		USpacer* StatusSpacer = WidgetTree->ConstructWidget<USpacer>(USpacer::StaticClass(), TEXT("StatusSpacer"));
		StatusSpacer->SetSize(FVector2D(0.f, 16.f));
		FormContainer->AddChildToVerticalBox(StatusSpacer);

		StatusText = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), TEXT("StatusText"));
		StatusText->SetText(FText::GetEmpty());
		StatusText->SetJustification(ETextJustify::Center);
		StatusText->SetAutoWrapText(true);
		UVerticalBoxSlot* StatusSlot = FormContainer->AddChildToVerticalBox(StatusText);
		StatusSlot->SetHorizontalAlignment(HAlign_Fill);

		WidgetTree->RootWidget = RootOverlay;
	}

	return Super::RebuildWidget();
}

// ---------------------------------------------------------------------------
// NativeConstruct — delegate binding only
// ---------------------------------------------------------------------------

void UROWSLoginWidget::NativeConstruct()
{
	Super::NativeConstruct();

	AuthSubsystem = GetGameInstance()->GetSubsystem<UROWSAuthSubsystem>();

	if (LoginButton) LoginButton->OnClicked.AddDynamic(this, &UROWSLoginWidget::OnLoginButtonClicked);
	if (SwitchToRegisterButton) SwitchToRegisterButton->OnClicked.AddDynamic(this, &UROWSLoginWidget::OnSwitchToRegisterClicked);
	if (RegisterButton) RegisterButton->OnClicked.AddDynamic(this, &UROWSLoginWidget::OnRegisterButtonClicked);
	if (SwitchToLoginButton) SwitchToLoginButton->OnClicked.AddDynamic(this, &UROWSLoginWidget::OnSwitchToLoginClicked);

	if (AuthSubsystem)
	{
		AuthSubsystem->OnLoginSuccess.AddDynamic(this, &UROWSLoginWidget::HandleLoginSuccess);
		AuthSubsystem->OnLoginError.AddDynamic(this, &UROWSLoginWidget::HandleLoginError);
		AuthSubsystem->OnRegisterSuccess.AddDynamic(this, &UROWSLoginWidget::HandleRegisterSuccess);
		AuthSubsystem->OnRegisterError.AddDynamic(this, &UROWSLoginWidget::HandleRegisterError);
		AuthSubsystem->OnLogoutSuccess.AddDynamic(this, &UROWSLoginWidget::HandleLogoutSuccess);
		AuthSubsystem->OnLogoutError.AddDynamic(this, &UROWSLoginWidget::HandleLogoutError);
	}
}

void UROWSLoginWidget::NativeDestruct()
{
	if (AuthSubsystem)
	{
		AuthSubsystem->OnLoginSuccess.RemoveDynamic(this, &UROWSLoginWidget::HandleLoginSuccess);
		AuthSubsystem->OnLoginError.RemoveDynamic(this, &UROWSLoginWidget::HandleLoginError);
		AuthSubsystem->OnRegisterSuccess.RemoveDynamic(this, &UROWSLoginWidget::HandleRegisterSuccess);
		AuthSubsystem->OnRegisterError.RemoveDynamic(this, &UROWSLoginWidget::HandleRegisterError);
		AuthSubsystem->OnLogoutSuccess.RemoveDynamic(this, &UROWSLoginWidget::HandleLogoutSuccess);
		AuthSubsystem->OnLogoutError.RemoveDynamic(this, &UROWSLoginWidget::HandleLogoutError);
	}
	Super::NativeDestruct();
}

// ---------------------------------------------------------------------------
// Panel Builders
// ---------------------------------------------------------------------------

UVerticalBox* UROWSLoginWidget::BuildLoginPanel()
{
	UVerticalBox* Panel = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass(), TEXT("LoginPanel"));

	LoginEmailField = CreateTextField(TEXT("Email"));
	Panel->AddChildToVerticalBox(LoginEmailField)->SetPadding(FMargin(0.f, 0.f, 0.f, 8.f));

	LoginPasswordField = CreateTextField(TEXT("Password"), true);
	Panel->AddChildToVerticalBox(LoginPasswordField)->SetPadding(FMargin(0.f, 0.f, 0.f, 16.f));

	LoginButton = CreateButton(TEXT("Login"), LoginButtonText);
	Panel->AddChildToVerticalBox(LoginButton)->SetPadding(FMargin(0.f, 0.f, 0.f, 8.f));

	SwitchToRegisterButton = CreateButton(TEXT("Create Account"), SwitchToRegisterText);
	FButtonStyle LinkStyle;
	LinkStyle.Normal.TintColor = FSlateColor(FLinearColor::Transparent);
	LinkStyle.Hovered.TintColor = FSlateColor(FLinearColor(1.f, 1.f, 1.f, 0.1f));
	LinkStyle.Pressed.TintColor = FSlateColor(FLinearColor(1.f, 1.f, 1.f, 0.2f));
	SwitchToRegisterButton->SetStyle(LinkStyle);
	Panel->AddChildToVerticalBox(SwitchToRegisterButton);

	return Panel;
}

UVerticalBox* UROWSLoginWidget::BuildRegisterPanel()
{
	UVerticalBox* Panel = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass(), TEXT("RegisterPanel"));

	RegisterFirstNameField = CreateTextField(TEXT("First Name"));
	Panel->AddChildToVerticalBox(RegisterFirstNameField)->SetPadding(FMargin(0.f, 0.f, 0.f, 8.f));

	RegisterLastNameField = CreateTextField(TEXT("Last Name"));
	Panel->AddChildToVerticalBox(RegisterLastNameField)->SetPadding(FMargin(0.f, 0.f, 0.f, 8.f));

	RegisterEmailField = CreateTextField(TEXT("Email"));
	Panel->AddChildToVerticalBox(RegisterEmailField)->SetPadding(FMargin(0.f, 0.f, 0.f, 8.f));

	RegisterPasswordField = CreateTextField(TEXT("Password"), true);
	Panel->AddChildToVerticalBox(RegisterPasswordField)->SetPadding(FMargin(0.f, 0.f, 0.f, 16.f));

	RegisterButton = CreateButton(TEXT("Register"), RegisterButtonText);
	Panel->AddChildToVerticalBox(RegisterButton)->SetPadding(FMargin(0.f, 0.f, 0.f, 8.f));

	SwitchToLoginButton = CreateButton(TEXT("Back to Login"), SwitchToLoginText);
	FButtonStyle LinkStyle;
	LinkStyle.Normal.TintColor = FSlateColor(FLinearColor::Transparent);
	LinkStyle.Hovered.TintColor = FSlateColor(FLinearColor(1.f, 1.f, 1.f, 0.1f));
	LinkStyle.Pressed.TintColor = FSlateColor(FLinearColor(1.f, 1.f, 1.f, 0.2f));
	SwitchToLoginButton->SetStyle(LinkStyle);
	Panel->AddChildToVerticalBox(SwitchToLoginButton);

	return Panel;
}

UEditableTextBox* UROWSLoginWidget::CreateTextField(const FString& HintText, bool bIsPassword)
{
	FName WidgetName = *FString::Printf(TEXT("Field_%s"), *HintText.Replace(TEXT(" "), TEXT("")));
	UEditableTextBox* Field = WidgetTree->ConstructWidget<UEditableTextBox>(UEditableTextBox::StaticClass(), WidgetName);
	Field->SetHintText(FText::FromString(HintText));
	Field->SetIsPassword(bIsPassword);
	Field->SetMinDesiredWidth(300.f);
	FSlateFontInfo Font = Field->WidgetStyle.TextStyle.Font;
	Font.Size = 14;
	Field->WidgetStyle.SetFont(Font);
	Field->WidgetStyle.SetPadding(FMargin(8.f, 8.f));
	return Field;
}

UButton* UROWSLoginWidget::CreateButton(const FString& Label, TObjectPtr<UTextBlock>& OutTextBlock)
{
	FName BtnName = *FString::Printf(TEXT("Btn_%s"), *Label.Replace(TEXT(" "), TEXT("")));
	UButton* Btn = WidgetTree->ConstructWidget<UButton>(UButton::StaticClass(), BtnName);

	FName TextName = *FString::Printf(TEXT("BtnText_%s"), *Label.Replace(TEXT(" "), TEXT("")));
	OutTextBlock = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), TextName);
	OutTextBlock->SetText(FText::FromString(Label));
	OutTextBlock->SetJustification(ETextJustify::Center);
	FSlateFontInfo BtnFont = OutTextBlock->GetFont();
	BtnFont.Size = 16;
	OutTextBlock->SetFont(BtnFont);
	Btn->AddChild(OutTextBlock);
	return Btn;
}

void UROWSLoginWidget::SetStatusMessage(const FString& Message, FLinearColor Color)
{
	if (StatusText)
	{
		StatusText->SetText(FText::FromString(Message));
		StatusText->SetColorAndOpacity(FSlateColor(Color));
	}
}

// ---------------------------------------------------------------------------
// Panel Switching
// ---------------------------------------------------------------------------

void UROWSLoginWidget::ShowLoginPanel()  { if (PanelSwitcher) { PanelSwitcher->SetActiveWidgetIndex(0); SetStatusMessage(TEXT("")); } }
void UROWSLoginWidget::ShowRegisterPanel() { if (PanelSwitcher) { PanelSwitcher->SetActiveWidgetIndex(1); SetStatusMessage(TEXT("")); } }

// ---------------------------------------------------------------------------
// Button Handlers
// ---------------------------------------------------------------------------

void UROWSLoginWidget::OnLoginButtonClicked()
{
	if (!LoginEmailField || !LoginPasswordField) return;
	FString Email = LoginEmailField->GetText().ToString();
	FString Password = LoginPasswordField->GetText().ToString();
	if (Email.IsEmpty() || Password.IsEmpty()) { SetStatusMessage(TEXT("Please enter email and password."), FLinearColor(1.f, 0.6f, 0.f)); return; }
	SetStatusMessage(TEXT("Logging in..."), FLinearColor::White);
	LoginAndCreateSession(Email, Password);
}

void UROWSLoginWidget::OnRegisterButtonClicked()
{
	if (!RegisterEmailField || !RegisterPasswordField) return;
	FString Email = RegisterEmailField->GetText().ToString();
	FString Password = RegisterPasswordField->GetText().ToString();
	FString First = RegisterFirstNameField ? RegisterFirstNameField->GetText().ToString() : TEXT("");
	FString Last = RegisterLastNameField ? RegisterLastNameField->GetText().ToString() : TEXT("");
	if (Email.IsEmpty() || Password.IsEmpty()) { SetStatusMessage(TEXT("Email and password are required."), FLinearColor(1.f, 0.6f, 0.f)); return; }
	SetStatusMessage(TEXT("Registering..."), FLinearColor::White);
	Register(Email, Password, First, Last);
}

void UROWSLoginWidget::OnSwitchToRegisterClicked() { ShowRegisterPanel(); }
void UROWSLoginWidget::OnSwitchToLoginClicked() { ShowLoginPanel(); }

// ---------------------------------------------------------------------------
// Auth Actions
// ---------------------------------------------------------------------------

void UROWSLoginWidget::LoginAndCreateSession(const FString& Email, const FString& Password) { if (AuthSubsystem) AuthSubsystem->LoginAndCreateSession(Email, Password); }
void UROWSLoginWidget::ExternalLoginAndCreateSession(const FString& Token) { if (AuthSubsystem) AuthSubsystem->ExternalLoginAndCreateSession(Token); }
void UROWSLoginWidget::Register(const FString& Email, const FString& Password, const FString& First, const FString& Last) { if (AuthSubsystem) AuthSubsystem->Register(Email, Password, First, Last); }
void UROWSLoginWidget::Logout() { if (AuthSubsystem) { UROWSSubsystem* Core = GetGameInstance()->GetSubsystem<UROWSSubsystem>(); if (Core) AuthSubsystem->Logout(Core->GetUserSessionGUID()); } }

// ---------------------------------------------------------------------------
// Delegate Handlers -> Status + Blueprint Events
// ---------------------------------------------------------------------------

void UROWSLoginWidget::HandleLoginSuccess(const FString& GUID) { SetStatusMessage(TEXT("Login successful!"), FLinearColor::Green); NotifyLoginSuccess(GUID); }
void UROWSLoginWidget::HandleLoginError(const FString& Err) { SetStatusMessage(Err, FLinearColor::Red); NotifyLoginError(Err); }
void UROWSLoginWidget::HandleRegisterSuccess(const FString& GUID) { SetStatusMessage(TEXT("Registration successful!"), FLinearColor::Green); NotifyRegisterSuccess(GUID); }
void UROWSLoginWidget::HandleRegisterError(const FString& Err) { SetStatusMessage(Err, FLinearColor::Red); NotifyRegisterError(Err); }
void UROWSLoginWidget::HandleLogoutSuccess() { SetStatusMessage(TEXT("Logged out."), FLinearColor::White); NotifyLogoutSuccess(); }
void UROWSLoginWidget::HandleLogoutError(const FString& Err) { SetStatusMessage(Err, FLinearColor::Red); NotifyLogoutError(Err); }
