#include "SchuckUsernameSetup.h"
#include "Net/chuckKbveApiClient.h"
#include "KBVESupabaseSubsystem.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Text/STextBlock.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Layout/SBox.h"
#include "Styling/CoreStyle.h"

#define LOCTEXT_NAMESPACE "SchuckUsernameSetup"

void SchuckUsernameSetup::Construct(const FArguments& InArgs)
{
	Subsystem = InArgs._Subsystem;
	ApiClient = InArgs._ApiClient;
	OnUsernameSet = InArgs._OnUsernameSet;
	OnSessionExpired = InArgs._OnSessionExpired;

	const FSlateFontInfo TitleFont = FCoreStyle::GetDefaultFontStyle("Bold", 22);
	const FSlateFontInfo StatusFont = FCoreStyle::GetDefaultFontStyle("Regular", 10);

	NameBox = SNew(SEditableTextBox).HintText(LOCTEXT("NameHint", "choose a username"));
	StatusText = SNew(STextBlock).Font(StatusFont).Text(FText::GetEmpty());
	ConfirmButton = SNew(SButton)
		.HAlign(HAlign_Center).VAlign(VAlign_Center)
		.OnClicked(FOnClicked::CreateSP(this, &SchuckUsernameSetup::HandleConfirm))
		[
			SNew(STextBlock).Text(LOCTEXT("Confirm", "Set Username"))
		];

	ChildSlot
	.HAlign(HAlign_Center).VAlign(VAlign_Center)
	[
		SNew(SBox).WidthOverride(360.f)
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 0.f, 0.f, 12.f)
			[
				SNew(STextBlock).Font(TitleFont).Text(LOCTEXT("Title", "Pick a username"))
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
			[
				NameBox.ToSharedRef()
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
			[
				ConfirmButton.ToSharedRef()
			]
			+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
			[
				StatusText.ToSharedRef()
			]
		]
	];
}

void SchuckUsernameSetup::SetStatus(const FText& Text)
{
	if (StatusText.IsValid())
	{
		StatusText->SetText(Text);
	}
}

void SchuckUsernameSetup::SetBusy(bool bInBusy)
{
	bBusy = bInBusy;
	if (NameBox.IsValid())
	{
		NameBox->SetEnabled(!bInBusy);
	}
	if (ConfirmButton.IsValid())
	{
		ConfirmButton->SetEnabled(!bInBusy);
	}
}

FReply SchuckUsernameSetup::HandleConfirm()
{
	if (bBusy)
	{
		return FReply::Handled();
	}

	const FString Name = NameBox.IsValid() ? NameBox->GetText().ToString().TrimStartAndEnd() : FString();
	if (Name.IsEmpty())
	{
		SetStatus(LOCTEXT("Empty", "Enter a username"));
		return FReply::Handled();
	}

	UchuckKbveApiClient* Api = ApiClient.Get();
	if (!Api)
	{
		SetStatus(LOCTEXT("NoApi", "Client unavailable"));
		return FReply::Handled();
	}

	SetBusy(true);
	SetStatus(LOCTEXT("Setting", "Setting..."));

	TWeakPtr<SchuckUsernameSetup> WeakSelf = SharedThis(this);
	Api->SetUsername(Name, [WeakSelf](EchuckSetUsernameResult Result, const FString& Canonical)
	{
		TSharedPtr<SchuckUsernameSetup> Self = WeakSelf.Pin();
		if (!Self.IsValid())
		{
			return;
		}
		switch (Result)
		{
		case EchuckSetUsernameResult::Ok:
			if (UKBVESupabaseSubsystem* Sub = Self->Subsystem.Get())
			{
				Sub->RefreshSession();
			}
			Self->OnUsernameSet.ExecuteIfBound(Canonical);
			break;
		case EchuckSetUsernameResult::Taken:
			Self->SetStatus(LOCTEXT("Taken", "Username taken - try another"));
			Self->SetBusy(false);
			break;
		case EchuckSetUsernameResult::Invalid:
			Self->SetStatus(LOCTEXT("Invalid", "Invalid username"));
			Self->SetBusy(false);
			break;
		case EchuckSetUsernameResult::Unauthorized:
			Self->SetBusy(false);
			Self->OnSessionExpired.ExecuteIfBound();
			break;
		default:
			Self->SetStatus(LOCTEXT("ServerErr", "Server unavailable - try again"));
			Self->SetBusy(false);
			break;
		}
	});

	return FReply::Handled();
}

#undef LOCTEXT_NAMESPACE
