#include "SchuckLoginWidget.h"

#include "ChuckUIStyle.h"
#include "KBVESupabaseSubsystem.h"
#include "KBVESupabaseTypes.h"

#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"

#define LOCTEXT_NAMESPACE "SchuckLoginWidget"

namespace
{
	const TCHAR* OAuthLabels[] = { TEXT("Discord"), TEXT("GitHub"), TEXT("Google") };
	EKBVESupabaseOAuthProvider OAuthProviders[] = {
		EKBVESupabaseOAuthProvider::Discord,
		EKBVESupabaseOAuthProvider::GitHub,
		EKBVESupabaseOAuthProvider::Google,
	};

	TSharedRef<SWidget> MakeFieldRow(const FText& Label, TSharedRef<SEditableTextBox> Box, const FSlateFontInfo& Font)
	{
		return SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 4.f, 0.f, 2.f)
			[
				SNew(STextBlock).Text(Label).Font(Font).ColorAndOpacity(FSlateColor(FLinearColor(0.78f, 0.85f, 0.95f)))
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 6.f)
			[
				Box
			];
	}
}

void SchuckLoginWidget::Construct(const FArguments& InArgs)
{
	Subsystem = InArgs._Subsystem;

	const FSlateFontInfo TitleFont = FCoreStyle::GetDefaultFontStyle("Bold", 22);
	const FSlateFontInfo LabelFont = FCoreStyle::GetDefaultFontStyle("Regular", 11);
	const FSlateFontInfo ButtonFont = FCoreStyle::GetDefaultFontStyle("Bold", 12);
	const FSlateFontInfo StatusFont = FCoreStyle::GetDefaultFontStyle("Regular", 10);

	EmailBox = SNew(SEditableTextBox).HintText(LOCTEXT("EmailHint", "you@example.com"));
	PasswordBox = SNew(SEditableTextBox).IsPassword(true).HintText(LOCTEXT("PasswordHint", "password"));

	TSharedRef<SHorizontalBox> OAuthRow = SNew(SHorizontalBox);
	for (int32 i = 0; i < UE_ARRAY_COUNT(OAuthLabels); ++i)
	{
		const int32 Idx = i;
		OAuthRow->AddSlot().FillWidth(1.f).Padding(4.f, 0.f)
		[
			SNew(SButton)
			.HAlign(HAlign_Center).VAlign(VAlign_Center)
			.OnClicked(FOnClicked::CreateSP(this, &SchuckLoginWidget::HandleOAuth, Idx))
			[
				SNew(STextBlock).Text(FText::FromString(OAuthLabels[Idx])).Font(ButtonFont)
			]
		];
	}

	ChildSlot
	[
		SNew(SOverlay)
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
		[
			SNew(SBorder)
			.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush"))
			.BorderBackgroundColor(FSlateColor(FLinearColor(0.06f, 0.08f, 0.11f, 0.96f)))
			.Padding(FMargin(24.f))
			[
				SNew(SBox).WidthOverride(420.f)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 0.f, 0.f, 12.f)
					[
						SNew(STextBlock).Text(LOCTEXT("Title", "Sign in to ChuckRPG")).Font(TitleFont)
					]
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeFieldRow(LOCTEXT("EmailLabel", "Email"), EmailBox.ToSharedRef(), LabelFont)
					]
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeFieldRow(LOCTEXT("PasswordLabel", "Password"), PasswordBox.ToSharedRef(), LabelFont)
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 8.f, 0.f, 4.f)
					[
						SNew(SHorizontalBox)
						+ SHorizontalBox::Slot().FillWidth(1.f).Padding(0.f, 0.f, 4.f, 0.f)
						[
							SNew(SButton)
							.HAlign(HAlign_Center).VAlign(VAlign_Center)
							.OnClicked(FOnClicked::CreateSP(this, &SchuckLoginWidget::HandleSignIn))
							[
								SNew(STextBlock).Text(LOCTEXT("SignIn", "Sign In")).Font(ButtonFont)
							]
						]
						+ SHorizontalBox::Slot().FillWidth(1.f).Padding(4.f, 0.f, 0.f, 0.f)
						[
							SNew(SButton)
							.HAlign(HAlign_Center).VAlign(VAlign_Center)
							.OnClicked(FOnClicked::CreateSP(this, &SchuckLoginWidget::HandleSignUp))
							[
								SNew(STextBlock).Text(LOCTEXT("SignUp", "Sign Up")).Font(ButtonFont)
							]
						]
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 12.f, 0.f, 4.f)
					[
						SNew(STextBlock)
						.Text(LOCTEXT("OAuth", "or continue with"))
						.Font(LabelFont)
						.ColorAndOpacity(FSlateColor(FLinearColor(0.6f, 0.66f, 0.78f)))
						.Justification(ETextJustify::Center)
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
					[
						OAuthRow
					]
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 0.f, 0.f, 4.f)
					[
						SNew(SButton)
						.HAlign(HAlign_Center).VAlign(VAlign_Center)
						.OnClicked(FOnClicked::CreateSP(this, &SchuckLoginWidget::HandleAnonymous))
						[
							SNew(STextBlock).Text(LOCTEXT("Anon", "Play as Guest")).Font(LabelFont)
						]
					]
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 6.f, 0.f, 0.f)
					[
						SAssignNew(StatusText, STextBlock)
						.Text(FText::GetEmpty())
						.Font(StatusFont)
						.ColorAndOpacity(FSlateColor(FLinearColor(0.85f, 0.85f, 0.85f)))
					]
				]
			]
		]
	];
}

void SchuckLoginWidget::SetStatusText(const FText& InText, const FLinearColor& InColor)
{
	if (StatusText.IsValid())
	{
		StatusText->SetText(InText);
		StatusText->SetColorAndOpacity(FSlateColor(InColor));
	}
}

void SchuckLoginWidget::SetBusy(bool bInBusy)
{
	bBusy = bInBusy;
	SetVisibility(bInBusy ? EVisibility::HitTestInvisible : EVisibility::Visible);
}

FReply SchuckLoginWidget::HandleSignIn()
{
	if (bBusy) return FReply::Handled();
	UKBVESupabaseSubsystem* Sub = Subsystem.Get();
	if (!Sub) return FReply::Handled();
	const FString Email = EmailBox->GetText().ToString();
	const FString Password = PasswordBox->GetText().ToString();
	if (Email.IsEmpty() || Password.IsEmpty())
	{
		SetStatusText(LOCTEXT("MissingFields", "Email and password required"), FLinearColor(1.f, 0.4f, 0.3f));
		return FReply::Handled();
	}
	SetStatusText(LOCTEXT("SigningIn", "Signing in..."), FLinearColor(0.85f, 0.85f, 0.85f));
	Sub->SignInWithPassword(Email, Password);
	return FReply::Handled();
}

FReply SchuckLoginWidget::HandleSignUp()
{
	if (bBusy) return FReply::Handled();
	UKBVESupabaseSubsystem* Sub = Subsystem.Get();
	if (!Sub) return FReply::Handled();
	const FString Email = EmailBox->GetText().ToString();
	const FString Password = PasswordBox->GetText().ToString();
	if (Email.IsEmpty() || Password.IsEmpty())
	{
		SetStatusText(LOCTEXT("MissingFields", "Email and password required"), FLinearColor(1.f, 0.4f, 0.3f));
		return FReply::Handled();
	}
	SetStatusText(LOCTEXT("SigningUp", "Creating account..."), FLinearColor(0.85f, 0.85f, 0.85f));
	Sub->SignUpWithPassword(Email, Password);
	return FReply::Handled();
}

FReply SchuckLoginWidget::HandleOAuth(int32 ProviderIndex)
{
	if (bBusy) return FReply::Handled();
	UKBVESupabaseSubsystem* Sub = Subsystem.Get();
	if (!Sub) return FReply::Handled();
	if (ProviderIndex < 0 || ProviderIndex >= static_cast<int32>(UE_ARRAY_COUNT(OAuthProviders)))
	{
		return FReply::Handled();
	}
	SetStatusText(LOCTEXT("OpeningBrowser", "Opening browser..."), FLinearColor(0.85f, 0.85f, 0.85f));
	Sub->StartOAuthSignIn(OAuthProviders[ProviderIndex], FString());
	return FReply::Handled();
}

FReply SchuckLoginWidget::HandleAnonymous()
{
	if (bBusy) return FReply::Handled();
	UKBVESupabaseSubsystem* Sub = Subsystem.Get();
	if (!Sub) return FReply::Handled();
	SetStatusText(LOCTEXT("Anonymous", "Creating guest session..."), FLinearColor(0.85f, 0.85f, 0.85f));
	Sub->SignInAnonymously();
	return FReply::Handled();
}

#undef LOCTEXT_NAMESPACE
