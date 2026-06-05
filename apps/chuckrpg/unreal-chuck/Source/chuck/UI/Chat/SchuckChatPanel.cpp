#include "SchuckChatPanel.h"

#include "KBVESupabaseSubsystem.h"
#include "KBVESupabaseChat.h"

#include "Widgets/SBoxPanel.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"

#define LOCTEXT_NAMESPACE "SchuckChatPanel"

namespace
{
	FLinearColor PickKindColor(const FString& Kind, bool bIsEvent)
	{
		if (bIsEvent) return FLinearColor(0.95f, 0.78f, 0.32f);
		if (Kind.Equals(TEXT("CHAT"), ESearchCase::IgnoreCase)) return FLinearColor(0.78f, 0.88f, 0.98f);
		return FLinearColor(0.7f, 0.7f, 0.78f);
	}
}

void SchuckChatPanel::Construct(const FArguments& InArgs)
{
	Subsystem = InArgs._Subsystem;
	ActiveChannel = InArgs._DefaultChannel;

	const FSlateFontInfo HeaderFont = FCoreStyle::GetDefaultFontStyle("Bold", 11);
	const FSlateFontInfo ChatFont   = FCoreStyle::GetDefaultFontStyle("Regular", 10);
	const FSlateFontInfo ButtonFont = FCoreStyle::GetDefaultFontStyle("Regular", 10);

	ChildSlot
	[
		SNew(SBox).WidthOverride(360.f).HeightOverride(220.f)
		[
			SNew(SBorder)
			.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush"))
			.BorderBackgroundColor(FSlateColor(FLinearColor(0.04f, 0.06f, 0.09f, 0.78f)))
			.Padding(FMargin(8.f))
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 4.f)
				[
					SAssignNew(HeaderText, STextBlock)
					.Text(FText::FromString(FString::Printf(TEXT("Chat — %s (disconnected)"), *ActiveChannel)))
					.Font(HeaderFont)
				]
				+ SVerticalBox::Slot().FillHeight(1.f).Padding(0.f, 0.f, 0.f, 4.f)
				[
					SAssignNew(Scrollback, SScrollBox)
				]
				+ SVerticalBox::Slot().AutoHeight()
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().FillWidth(1.f).Padding(0.f, 0.f, 4.f, 0.f)
					[
						SAssignNew(InputBox, SEditableTextBox)
						.HintText(LOCTEXT("InputHint", "Press Enter to send..."))
						.OnTextCommitted(this, &SchuckChatPanel::HandleInputCommitted)
					]
					+ SHorizontalBox::Slot().AutoWidth()
					[
						SNew(SButton)
						.HAlign(HAlign_Center).VAlign(VAlign_Center)
						.OnClicked(FOnClicked::CreateSP(this, &SchuckChatPanel::HandleSendClicked))
						[
							SNew(STextBlock).Text(LOCTEXT("Send", "Send")).Font(ButtonFont)
						]
					]
				]
			]
		]
	];
}

void SchuckChatPanel::SetActiveChannel(const FString& InChannel)
{
	ActiveChannel = InChannel;
	if (HeaderText.IsValid())
	{
		HeaderText->SetText(FText::FromString(FString::Printf(
			TEXT("Chat — %s (%s)"),
			*ActiveChannel,
			bConnected ? TEXT("connected") : TEXT("disconnected"))));
	}
}

void SchuckChatPanel::OnChatStateChanged(const FchuckChatStatePayload& Payload)
{
	bConnected = Payload.bConnected;
	if (HeaderText.IsValid())
	{
		HeaderText->SetText(FText::FromString(FString::Printf(
			TEXT("Chat — %s (%s)"),
			*ActiveChannel,
			bConnected ? TEXT("connected") : TEXT("disconnected"))));
	}
	AppendSystem(bConnected ? TEXT("* connected") : TEXT("* disconnected"));
}

void SchuckChatPanel::OnChatLine(const FchuckChatLinePayload& Payload)
{
	if (!ActiveChannel.IsEmpty() && !Payload.Channel.IsEmpty() && !Payload.Channel.Equals(ActiveChannel, ESearchCase::IgnoreCase))
	{
		return;
	}
	AppendLine(Payload.Channel, Payload.Sender.IsEmpty() ? Payload.Nick : Payload.Sender,
		Payload.Kind, Payload.Body, Payload.bIsEvent);
}

void SchuckChatPanel::AppendLine(const FString& /*Channel*/, const FString& Sender, const FString& Kind, const FString& Body, bool bIsEvent)
{
	if (!Scrollback.IsValid()) return;

	const FSlateFontInfo NickFont = FCoreStyle::GetDefaultFontStyle("Bold", 10);
	const FSlateFontInfo BodyFont = FCoreStyle::GetDefaultFontStyle("Regular", 10);

	const FString NickLine = bIsEvent
		? FString::Printf(TEXT("[%s] %s"), *Kind, *Sender)
		: Sender;

	Scrollback->AddSlot().Padding(0.f, 1.f)
	[
		SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth().Padding(0.f, 0.f, 6.f, 0.f)
		[
			SNew(STextBlock)
			.Text(FText::FromString(NickLine + TEXT(":")))
			.Font(NickFont)
			.ColorAndOpacity(FSlateColor(PickKindColor(Kind, bIsEvent)))
		]
		+ SHorizontalBox::Slot().FillWidth(1.f)
		[
			SNew(STextBlock)
			.Text(FText::FromString(Body))
			.Font(BodyFont)
			.AutoWrapText(true)
			.ColorAndOpacity(FSlateColor(FLinearColor(0.95f, 0.95f, 0.96f)))
		]
	];

	Scrollback->ScrollToEnd();
}

void SchuckChatPanel::AppendSystem(const FString& Text)
{
	if (!Scrollback.IsValid()) return;
	const FSlateFontInfo SystemFont = FCoreStyle::GetDefaultFontStyle("Italic", 9);
	Scrollback->AddSlot().Padding(0.f, 1.f)
	[
		SNew(STextBlock)
		.Text(FText::FromString(Text))
		.Font(SystemFont)
		.ColorAndOpacity(FSlateColor(FLinearColor(0.6f, 0.66f, 0.78f)))
	];
	Scrollback->ScrollToEnd();
}

FReply SchuckChatPanel::HandleSendClicked()
{
	if (!InputBox.IsValid()) return FReply::Handled();
	const FString Body = InputBox->GetText().ToString();
	InputBox->SetText(FText::GetEmpty());
	if (Body.IsEmpty() || ActiveChannel.IsEmpty()) return FReply::Handled();

	UKBVESupabaseSubsystem* Sub = Subsystem.Get();
	if (!Sub) return FReply::Handled();
	UKBVESupabaseChat* Chat = Sub->GetChat();
	if (!Chat) return FReply::Handled();
	Chat->SendPrivMsg(ActiveChannel, Body);
	return FReply::Handled();
}

void SchuckChatPanel::HandleInputCommitted(const FText& InText, ETextCommit::Type CommitType)
{
	if (CommitType == ETextCommit::OnEnter)
	{
		HandleSendClicked();
	}
}

#undef LOCTEXT_NAMESPACE
