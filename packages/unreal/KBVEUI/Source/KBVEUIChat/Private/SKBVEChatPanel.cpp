#include "SKBVEChatPanel.h"

#include "KBVESupabaseSubsystem.h"
#include "KBVESupabaseChat.h"
#include "KBVESupabaseTypes.h"

#include "SKBVEMovableFrame.h"

#include "Widgets/SBoxPanel.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Text/STextBlock.h"
#include "Framework/Application/SlateApplication.h"
#include "Styling/CoreStyle.h"
#include "KBVEUITheme.h"

#define LOCTEXT_NAMESPACE "SKBVEChatPanel"

namespace
{
	const int32 MaxScrollbackLines = 500;
	const int32 MaxHistoryEntries  = 64;

	FLinearColor PickKindColor(const FString& Kind, bool bIsEvent)
	{
		if (bIsEvent) return KBVEUI::Theme::Color::Accent;
		if (Kind.Equals(TEXT("CHAT"), ESearchCase::IgnoreCase)) return FLinearColor(0.78f, 0.88f, 0.98f);
		if (Kind.Equals(TEXT("ME"), ESearchCase::IgnoreCase)) return FLinearColor(0.82f, 0.74f, 0.98f);
		return KBVEUI::Theme::Color::TextMuted;
	}

	FString FormatTimestampLocal()
	{
		return FDateTime::Now().ToString(TEXT("%H:%M"));
	}

	bool TokenizeArgs(const FString& Rest, TArray<FString>& OutTokens)
	{
		Rest.ParseIntoArrayWS(OutTokens);
		return OutTokens.Num() > 0;
	}

	FString NormalizeChannel(const FString& In)
	{
		FString Trimmed = In.TrimStartAndEnd();
		if (Trimmed.IsEmpty()) return Trimmed;
		if (!Trimmed.StartsWith(TEXT("#")) && !Trimmed.StartsWith(TEXT("&")))
		{
			Trimmed = TEXT("#") + Trimmed;
		}
		return Trimmed;
	}
}

void SKBVEChatPanel::Construct(const FArguments& InArgs)
{
	SetCanTick(false);
	Subsystem = InArgs._Subsystem;
	ActiveChannel = InArgs._DefaultChannel;
	OnCloseClicked = InArgs._OnCloseClicked;
	OnSaveGeometry = InArgs._OnSaveGeometry;
	OnLoadGeometry = InArgs._OnLoadGeometry;
	const FMargin DockPad = InArgs._DockPadding;

	if (!ActiveChannel.IsEmpty())
	{
		FChannelTab Tab;
		Tab.Name = ActiveChannel;
		Tabs.Add(MoveTemp(Tab));
	}

	const FSlateFontInfo HeaderFont = FCoreStyle::GetDefaultFontStyle("Bold", 11);
	const FSlateFontInfo ButtonFont = FCoreStyle::GetDefaultFontStyle("Regular", 10);

	FVector2D StartPos(64.f, 380.f);
	FVector2D StartSize(420.f, 280.f);
	if (OnLoadGeometry.IsBound())
	{
		FVector2D LoadedPos, LoadedSize;
		if (OnLoadGeometry.Execute(LoadedPos, LoadedSize))
		{
			StartPos  = LoadedPos;
			StartSize = LoadedSize;
		}
	}

	SetVisibility(EVisibility::SelfHitTestInvisible);

	TSharedRef<SHorizontalBox> NewTabRow = SNew(SHorizontalBox);
	TabRow = NewTabRow;

	ChildSlot
	[
		SAssignNew(MovableFrame, SKBVEMovableFrame)
		.Title(LOCTEXT("ChatTitle", "Chat"))
		.InitialPosition(StartPos)
		.FrameSize(StartSize)
		.MinFrameSize(FVector2D(320.f, 180.f))
		.bStartDocked(true)
		.DockPadding(DockPad)
		.OnCloseClicked_Lambda([this]()
		{
			Dock();
			OnCloseClicked.ExecuteIfBound();
		})
		.OnGeometryChanged_Lambda([this]() { PersistGeometry(); })
		.Body()
		[
			SNew(SBorder)
			.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush"))
			.BorderBackgroundColor_Lambda([this]() { return IsDocked() ? FSlateColor(FLinearColor::Transparent) : FSlateColor(KBVEUI::Theme::Color::PanelDeep.CopyWithNewOpacity(0.55f)); })
			.Padding(FMargin(2.f))
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight().Padding(2.f, 2.f, 2.f, 4.f)
				[
					SAssignNew(HeaderText, STextBlock)
					.Text(FText::GetEmpty())
					.Font(HeaderFont)
					.Visibility_Lambda([this]() { return IsDocked() ? EVisibility::Collapsed : EVisibility::Visible; })
				]
			+ SVerticalBox::Slot().AutoHeight().Padding(2.f, 0.f, 2.f, 4.f)
			[
				NewTabRow
			]
			+ SVerticalBox::Slot().FillHeight(1.f).Padding(2.f, 0.f, 2.f, 4.f)
			[
				SAssignNew(Scrollback, SScrollBox)
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(2.f)
			[
				SNew(SHorizontalBox)
				.Visibility_Lambda([this]() { return IsDocked() ? EVisibility::Collapsed : EVisibility::Visible; })
				+ SHorizontalBox::Slot().FillWidth(1.f).Padding(0.f, 0.f, 4.f, 0.f)
				[
					SAssignNew(InputBox, SEditableTextBox)
					.HintText(LOCTEXT("InputHint", "Type a message or /command"))
					.OnTextCommitted(this, &SKBVEChatPanel::HandleInputCommitted)
				]
				+ SHorizontalBox::Slot().AutoWidth()
				[
					SNew(SButton)
					.HAlign(HAlign_Center).VAlign(VAlign_Center)
					.OnClicked(FOnClicked::CreateSP(this, &SKBVEChatPanel::HandleSendClicked))
					[
						SNew(STextBlock).Text(LOCTEXT("Send", "Send")).Font(ButtonFont)
					]
				]
			]
			]
		]
	];

	RebuildTabs();
	UpdateHeader();
}

void SKBVEChatPanel::SetActiveChannel(const FString& InChannel)
{
	const FString Normalized = NormalizeChannel(InChannel);
	if (Normalized.IsEmpty() || Normalized.Equals(ActiveChannel, ESearchCase::IgnoreCase))
	{
		return;
	}
	ActiveChannel = Normalized;

	for (FChannelTab& Tab : Tabs)
	{
		if (Tab.Name.Equals(ActiveChannel, ESearchCase::IgnoreCase))
		{
			Tab.bUnread = false;
			break;
		}
	}
	RefreshTabStyles();
	UpdateHeader();
}

void SKBVEChatPanel::OnChatStateChanged(bool bInConnected)
{
	bConnected = bInConnected;
	UpdateHeader();
	AppendSystem(bConnected ? TEXT("* connected") : TEXT("* disconnected"));
}

void SKBVEChatPanel::OnChannelJoined(const FString& Channel)
{
	const FString Normalized = NormalizeChannel(Channel);
	if (Normalized.IsEmpty()) return;
	AddTab(Normalized);
	if (Tabs.Num() == 1)
	{
		ActiveChannel = Normalized;
	}
	RebuildTabs();
	UpdateHeader();
	AppendSystem(FString::Printf(TEXT("* joined %s"), *Normalized));
}

void SKBVEChatPanel::OnChannelLeft(const FString& Channel)
{
	const FString Normalized = NormalizeChannel(Channel);
	if (Normalized.IsEmpty()) return;
	RemoveTab(Normalized);
	if (ActiveChannel.Equals(Normalized, ESearchCase::IgnoreCase))
	{
		ActiveChannel = Tabs.Num() > 0 ? Tabs[0].Name : FString();
	}
	RebuildTabs();
	UpdateHeader();
	AppendSystem(FString::Printf(TEXT("* left %s"), *Normalized));
}

void SKBVEChatPanel::OnChatLine(const FKBVEChatLineView& Payload)
{
	if (Payload.Channel.IsEmpty()) return;
	if (!ActiveChannel.Equals(Payload.Channel, ESearchCase::IgnoreCase))
	{
		MarkChannelUnread(Payload.Channel);
		return;
	}
	AppendLine(Payload.Channel,
		Payload.Sender.IsEmpty() ? Payload.Nick : Payload.Sender,
		Payload.Kind, Payload.Body, Payload.bIsEvent);
}

void SKBVEChatPanel::MarkChannelUnread(const FString& Channel)
{
	for (FChannelTab& Tab : Tabs)
	{
		if (Tab.Name.Equals(Channel, ESearchCase::IgnoreCase))
		{
			Tab.bUnread = true;
			RefreshTabStyles();
			return;
		}
	}
	AddTab(Channel);
	for (FChannelTab& Tab : Tabs)
	{
		if (Tab.Name.Equals(Channel, ESearchCase::IgnoreCase))
		{
			Tab.bUnread = true;
		}
	}
	RebuildTabs();
}

void SKBVEChatPanel::AddTab(const FString& Channel)
{
	for (const FChannelTab& Tab : Tabs)
	{
		if (Tab.Name.Equals(Channel, ESearchCase::IgnoreCase)) return;
	}
	FChannelTab T;
	T.Name = Channel;
	Tabs.Add(MoveTemp(T));
}

void SKBVEChatPanel::RemoveTab(const FString& Channel)
{
	Tabs.RemoveAll([&Channel](const FChannelTab& T)
	{
		return T.Name.Equals(Channel, ESearchCase::IgnoreCase);
	});
}

void SKBVEChatPanel::RebuildTabs()
{
	if (!TabRow.IsValid()) return;
	TabRow->ClearChildren();

	const FSlateFontInfo TabFont = FCoreStyle::GetDefaultFontStyle("Bold", 10);

	for (int32 i = 0; i < Tabs.Num(); ++i)
	{
		const FString TabName = Tabs[i].Name;
		const bool bActive = TabName.Equals(ActiveChannel, ESearchCase::IgnoreCase);
		const bool bUnread = Tabs[i].bUnread;

		TSharedRef<STextBlock> Label = SNew(STextBlock)
			.Text(FText::FromString(TabName))
			.Font(TabFont)
			.ColorAndOpacity(FSlateColor(bUnread
				? KBVEUI::Theme::Color::Accent
				: (bActive ? FLinearColor::White : KBVEUI::Theme::Color::TextMuted)));

		TSharedRef<SBorder> Border = SNew(SBorder)
			.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush"))
			.BorderBackgroundColor(FSlateColor(bActive
				? KBVEUI::Theme::Color::PanelBg
				: KBVEUI::Theme::Color::PanelDeep))
			.Padding(FMargin(8.f, 4.f))
			.OnMouseButtonDown_Lambda([this, TabName](const FGeometry&, const FPointerEvent&) -> FReply
			{
				SetActiveChannel(TabName);
				return FReply::Handled();
			})
			[
				Label
			];

		Tabs[i].TabBorder = Border;
		Tabs[i].TabLabel = Label;

		TabRow->AddSlot().AutoWidth().Padding(0.f, 0.f, 4.f, 0.f)
		[
			Border
		];
	}
}

void SKBVEChatPanel::RefreshTabStyles()
{
	for (FChannelTab& Tab : Tabs)
	{
		const bool bActive = Tab.Name.Equals(ActiveChannel, ESearchCase::IgnoreCase);
		if (Tab.TabBorder.IsValid())
		{
			Tab.TabBorder->SetBorderBackgroundColor(FSlateColor(bActive
				? KBVEUI::Theme::Color::PanelBg
				: KBVEUI::Theme::Color::PanelDeep));
		}
		if (Tab.TabLabel.IsValid())
		{
			Tab.TabLabel->SetColorAndOpacity(FSlateColor(Tab.bUnread
				? KBVEUI::Theme::Color::Accent
				: (bActive ? FLinearColor::White : KBVEUI::Theme::Color::TextMuted)));
		}
	}
}

void SKBVEChatPanel::AppendLine(const FString& /*Channel*/, const FString& Sender, const FString& Kind, const FString& Body, bool bIsEvent)
{
	if (!Scrollback.IsValid()) return;

	const FSlateFontInfo TimeFont = FCoreStyle::GetDefaultFontStyle("Regular", 9);
	const FSlateFontInfo NickFont = FCoreStyle::GetDefaultFontStyle("Bold", 10);
	const FSlateFontInfo BodyFont = FCoreStyle::GetDefaultFontStyle("Regular", 10);

	const FString TimeStr = FormatTimestampLocal();
	const FString NickLine = bIsEvent
		? FString::Printf(TEXT("[%s] %s"), *Kind, *Sender)
		: Sender;

	Scrollback->AddSlot().Padding(0.f, 1.f)
	[
		SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth().Padding(0.f, 0.f, 6.f, 0.f)
		[
			SNew(STextBlock)
			.Text(FText::FromString(TimeStr))
			.Font(TimeFont)
			.ColorAndOpacity(FSlateColor(KBVEUI::Theme::Color::TextMuted))
		]
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
			.ColorAndOpacity(FSlateColor(KBVEUI::Theme::Color::TextBright))
		]
	];

	while (Scrollback->GetChildren()->Num() > MaxScrollbackLines)
	{
		Scrollback->RemoveSlot(Scrollback->GetChildren()->GetChildAt(0));
	}
	Scrollback->ScrollToEnd();
}

void SKBVEChatPanel::AppendSystem(const FString& Text)
{
	if (!Scrollback.IsValid()) return;
	const FSlateFontInfo SystemFont = FCoreStyle::GetDefaultFontStyle("Italic", 9);
	Scrollback->AddSlot().Padding(0.f, 1.f)
	[
		SNew(STextBlock)
		.Text(FText::FromString(Text))
		.Font(SystemFont)
		.ColorAndOpacity(FSlateColor(KBVEUI::Theme::Color::TextDisabled))
	];
	while (Scrollback->GetChildren()->Num() > MaxScrollbackLines)
	{
		Scrollback->RemoveSlot(Scrollback->GetChildren()->GetChildAt(0));
	}
	Scrollback->ScrollToEnd();
}

void SKBVEChatPanel::AppendMe(const FString& Channel, const FString& Sender, const FString& Body)
{
	AppendLine(Channel, Sender, TEXT("ME"), TEXT("* ") + Body, /*bIsEvent=*/false);
}

bool SKBVEChatPanel::ExecuteSlashCommand(const FString& InputLine)
{
	if (!InputLine.StartsWith(TEXT("/"))) return false;

	const FString WithoutSlash = InputLine.RightChop(1);
	FString Cmd, Rest;
	if (!WithoutSlash.Split(TEXT(" "), &Cmd, &Rest))
	{
		Cmd = WithoutSlash;
	}
	Cmd = Cmd.ToLower();

	UKBVESupabaseSubsystem* Sub = Subsystem.Get();
	UKBVESupabaseChat* Chat = Sub ? Sub->GetChat() : nullptr;

	if (Cmd == TEXT("join") || Cmd == TEXT("j"))
	{
		TArray<FString> Args;
		if (!TokenizeArgs(Rest, Args))
		{
			AppendSystem(TEXT("Usage: /join <channel>"));
			return true;
		}
		const FString Channel = NormalizeChannel(Args[0]);
		if (Chat) Chat->JoinChannel(Channel);
		return true;
	}
	if (Cmd == TEXT("part") || Cmd == TEXT("leave"))
	{
		TArray<FString> Args;
		const FString Target = TokenizeArgs(Rest, Args) ? NormalizeChannel(Args[0]) : ActiveChannel;
		FString Reason;
		for (int32 i = 1; i < Args.Num(); ++i)
		{
			if (!Reason.IsEmpty()) Reason += TEXT(' ');
			Reason += Args[i];
		}
		if (Chat) Chat->PartChannel(Target, Reason);
		return true;
	}
	if (Cmd == TEXT("me"))
	{
		const FString Body = Rest.TrimStartAndEnd();
		if (Body.IsEmpty() || ActiveChannel.IsEmpty()) return true;
		if (Chat)
		{
			Chat->SendPrivMsg(ActiveChannel, FString::Printf(TEXT("\x01""ACTION %s\x01"), *Body));
		}
		AppendMe(ActiveChannel, TEXT("you"), Body);
		return true;
	}
	if (Cmd == TEXT("msg") || Cmd == TEXT("w") || Cmd == TEXT("whisper"))
	{
		FString Target, Body;
		if (!Rest.Split(TEXT(" "), &Target, &Body))
		{
			AppendSystem(TEXT("Usage: /msg <nick> <message>"));
			return true;
		}
		Target = Target.TrimStartAndEnd();
		Body = Body.TrimStartAndEnd();
		if (Target.IsEmpty() || Body.IsEmpty())
		{
			AppendSystem(TEXT("Usage: /msg <nick> <message>"));
			return true;
		}
		if (Chat) Chat->SendPrivMsg(Target, Body);
		AppendLine(ActiveChannel, TEXT("you→") + Target, TEXT("CHAT"), Body, /*bIsEvent=*/false);
		return true;
	}
	if (Cmd == TEXT("quit") || Cmd == TEXT("disconnect"))
	{
		if (Chat) Chat->Disconnect();
		return true;
	}
	if (Cmd == TEXT("connect") || Cmd == TEXT("reconnect"))
	{
		if (Chat) Chat->Connect();
		return true;
	}
	if (Cmd == TEXT("raw"))
	{
		const FString Line = Rest.TrimStartAndEnd();
		if (Chat && !Line.IsEmpty()) Chat->SendRawLine(Line);
		return true;
	}
	if (Cmd == TEXT("clear"))
	{
		if (Scrollback.IsValid()) Scrollback->ClearChildren();
		return true;
	}
	if (Cmd == TEXT("help") || Cmd == TEXT("?"))
	{
		AppendSystem(TEXT("Commands: /join <chan> /part [chan] [reason] /me <text> /msg <nick> <text> /raw <line> /clear /quit /reconnect /help"));
		return true;
	}

	AppendSystem(FString::Printf(TEXT("Unknown command: /%s — try /help"), *Cmd));
	return true;
}

void SKBVEChatPanel::PushHistory(const FString& Line)
{
	if (Line.IsEmpty()) return;
	if (InputHistory.Num() == 0 || !InputHistory.Last().Equals(Line))
	{
		InputHistory.Add(Line);
		while (InputHistory.Num() > MaxHistoryEntries)
		{
			InputHistory.RemoveAt(0, 1, EAllowShrinking::No);
		}
	}
	HistoryCursor = -1;
	DraftBeforeRecall.Empty();
}

void SKBVEChatPanel::RecallHistoryDirection(int32 Direction)
{
	if (!InputBox.IsValid() || InputHistory.Num() == 0) return;

	if (HistoryCursor == -1)
	{
		DraftBeforeRecall = InputBox->GetText().ToString();
		HistoryCursor = InputHistory.Num();
	}

	HistoryCursor = FMath::Clamp(HistoryCursor + Direction, 0, InputHistory.Num());

	if (HistoryCursor == InputHistory.Num())
	{
		InputBox->SetText(FText::FromString(DraftBeforeRecall));
	}
	else
	{
		InputBox->SetText(FText::FromString(InputHistory[HistoryCursor]));
	}
}

FReply SKBVEChatPanel::OnPreviewKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent)
{
	if (InKeyEvent.GetKey() == EKeys::Slash)
	{
		Dock();
		OnCloseClicked.ExecuteIfBound();
		return FReply::Handled();
	}
	return FReply::Unhandled();
}

FReply SKBVEChatPanel::OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent)
{
	if (InputBox.IsValid() && InputBox->HasKeyboardFocus())
	{
		if (InKeyEvent.GetKey() == EKeys::Up)
		{
			RecallHistoryDirection(-1);
			return FReply::Handled();
		}
		if (InKeyEvent.GetKey() == EKeys::Down)
		{
			RecallHistoryDirection(+1);
			return FReply::Handled();
		}
		if (InKeyEvent.GetKey() == EKeys::Escape)
		{
			FSlateApplication::Get().ClearKeyboardFocus(EFocusCause::Cleared);
			return FReply::Handled();
		}
	}
	return SCompoundWidget::OnKeyDown(MyGeometry, InKeyEvent);
}

FReply SKBVEChatPanel::HandleSendClicked()
{
	if (!InputBox.IsValid()) return FReply::Handled();
	const FString Body = InputBox->GetText().ToString();
	InputBox->SetText(FText::GetEmpty());
	if (Body.IsEmpty()) return FReply::Handled();

	PushHistory(Body);

	if (Body.StartsWith(TEXT("/")))
	{
		ExecuteSlashCommand(Body);
		return FReply::Handled();
	}

	if (ActiveChannel.IsEmpty()) return FReply::Handled();

	UKBVESupabaseSubsystem* Sub = Subsystem.Get();
	if (!Sub) return FReply::Handled();
	UKBVESupabaseChat* Chat = Sub->GetChat();
	if (!Chat) return FReply::Handled();
	if (Chat->SendPrivMsg(ActiveChannel, Body))
	{
		const FKBVESupabaseUser& U = Sub->GetUser();
		FString MyName = U.KbveUsername;
		if (MyName.IsEmpty()) MyName = U.Email;
		if (MyName.IsEmpty()) MyName = TEXT("me");
		AppendLine(ActiveChannel, MyName, TEXT("CHAT"), Body, false);
	}
	return FReply::Handled();
}

void SKBVEChatPanel::HandleInputCommitted(const FText& InText, ETextCommit::Type CommitType)
{
	if (CommitType == ETextCommit::OnEnter)
	{
		HandleSendClicked();
	}
}

bool SKBVEChatPanel::ToggleVisible()
{
	const EVisibility Cur = GetVisibility();
	const bool bShow = (Cur == EVisibility::Collapsed || Cur == EVisibility::Hidden);
	SetVisibility(bShow ? EVisibility::SelfHitTestInvisible : EVisibility::Collapsed);
	if (bShow)
	{
		ShowAndFocusInput();
	}
	return bShow;
}

void SKBVEChatPanel::ShowAndFocusInput()
{
	SetVisibility(EVisibility::SelfHitTestInvisible);
	if (InputBox.IsValid())
	{
		FSlateApplication::Get().SetKeyboardFocus(InputBox, EFocusCause::SetDirectly);
	}
}

void SKBVEChatPanel::Dock()
{
	if (MovableFrame.IsValid())
	{
		MovableFrame->SetDocked(true);
	}
	SetVisibility(EVisibility::SelfHitTestInvisible);
}

void SKBVEChatPanel::Undock()
{
	if (MovableFrame.IsValid())
	{
		MovableFrame->SetDocked(false);
	}
	ShowAndFocusInput();
}

bool SKBVEChatPanel::IsDocked() const
{
	return MovableFrame.IsValid() && MovableFrame->IsDocked();
}

void SKBVEChatPanel::PersistGeometry()
{
	if (!MovableFrame.IsValid() || MovableFrame->IsDocked()) return;
	OnSaveGeometry.ExecuteIfBound(MovableFrame->GetCurrentPosition(), MovableFrame->GetCurrentSize());
}

void SKBVEChatPanel::UpdateHeader()
{
	if (!HeaderText.IsValid()) return;
	const TCHAR* StateLabel = bConnected ? TEXT("connected") : TEXT("disconnected");
	const FString Channel = ActiveChannel.IsEmpty() ? TEXT("—") : ActiveChannel;
	HeaderText->SetText(FText::FromString(FString::Printf(TEXT("%s · %s"), *Channel, StateLabel)));
}

#undef LOCTEXT_NAMESPACE
