#include "SchuckAccountPanel.h"

#include "KBVESupabaseSubsystem.h"

#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"

#define LOCTEXT_NAMESPACE "SchuckAccountPanel"

void SchuckAccountPanel::Construct(const FArguments& InArgs)
{
	Subsystem = InArgs._Subsystem;

	const FSlateFontInfo NickFont = FCoreStyle::GetDefaultFontStyle("Bold", 13);
	const FSlateFontInfo EmailFont = FCoreStyle::GetDefaultFontStyle("Regular", 9);
	const FSlateFontInfo ButtonFont = FCoreStyle::GetDefaultFontStyle("Regular", 10);

	ChildSlot
	[
		SNew(SBorder)
		.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush"))
		.BorderBackgroundColor(FSlateColor(FLinearColor(0.04f, 0.06f, 0.09f, 0.85f)))
		.Padding(FMargin(10.f, 6.f))
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0.f, 0.f, 10.f, 0.f)
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()
				[
					SAssignNew(UsernameText, STextBlock).Text(LOCTEXT("Unknown", "—")).Font(NickFont)
				]
				+ SVerticalBox::Slot().AutoHeight()
				[
					SAssignNew(EmailText, STextBlock)
					.Text(FText::GetEmpty())
					.Font(EmailFont)
					.ColorAndOpacity(FSlateColor(FLinearColor(0.7f, 0.74f, 0.82f)))
				]
			]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
			[
				SNew(SButton)
				.HAlign(HAlign_Center).VAlign(VAlign_Center)
				.OnClicked(FOnClicked::CreateSP(this, &SchuckAccountPanel::HandleSignOut))
				[
					SNew(STextBlock).Text(LOCTEXT("SignOut", "Sign Out")).Font(ButtonFont)
				]
			]
		]
	];
}

void SchuckAccountPanel::SetUsername(const FString& InUsername)
{
	if (UsernameText.IsValid())
	{
		UsernameText->SetText(InUsername.IsEmpty() ? LOCTEXT("Guest", "Guest") : FText::FromString(InUsername));
	}
}

void SchuckAccountPanel::SetEmail(const FString& InEmail)
{
	if (EmailText.IsValid())
	{
		EmailText->SetText(FText::FromString(InEmail));
	}
}

FReply SchuckAccountPanel::HandleSignOut()
{
	if (UKBVESupabaseSubsystem* Sub = Subsystem.Get())
	{
		Sub->SignOut(/*bAlsoRevokeServerSide=*/true);
	}
	return FReply::Handled();
}

#undef LOCTEXT_NAMESPACE
