#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Framework/SlateDelegates.h"
#include "Input/Reply.h"
#include "chuckEventPayloads.h"

class UKBVESupabaseSubsystem;
class AchuckCoreCharacter;
class SEditableTextBox;
class SScrollBox;
class SHorizontalBox;
class SBorder;
class STextBlock;
class SWidget;
class SKBVEMovableFrame;

/**
 * Chat window for the irc-gateway WebSocket. Wraps SKBVEMovableFrame for
 * drag / resize / close, persists geometry via UchuckSettings under the
 * "chuck.chat" key, and renders channel tabs + scrollback + input.
 *
 * Bridges the chuck event bus (FchuckChatStatePayload / FchuckChatLinePayload)
 * onto Slate so the widget never imports UKBVESupabaseSubsystem directly
 * except to dispatch outbound commands.
 */
class SchuckChatPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckChatPanel)
		: _DefaultChannel(TEXT("#global"))
	{}
		SLATE_ARGUMENT(TWeakObjectPtr<UKBVESupabaseSubsystem>, Subsystem)
		SLATE_ARGUMENT(TWeakObjectPtr<AchuckCoreCharacter>, OwningCharacter)
		SLATE_ARGUMENT(FString, DefaultChannel)
		SLATE_EVENT(FSimpleDelegate, OnCloseClicked)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	void OnChatStateChanged(const FchuckChatStatePayload& Payload);
	void OnChatLine(const FchuckChatLinePayload& Payload);
	void OnChannelJoined(const FString& Channel);
	void OnChannelLeft(const FString& Channel);

	void SetActiveChannel(const FString& InChannel);
	const FString& GetActiveChannel() const { return ActiveChannel; }

	bool ToggleVisible();
	void ShowAndFocusInput();

protected:
	virtual bool SupportsKeyboardFocus() const override { return true; }
	virtual FReply OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent) override;

private:
	struct FChannelTab
	{
		FString Name;
		TSharedPtr<SBorder> TabBorder;
		TSharedPtr<STextBlock> TabLabel;
		bool bUnread = false;
	};

	FReply HandleSendClicked();
	void   HandleInputCommitted(const FText& InText, ETextCommit::Type CommitType);
	void   AppendLine(const FString& Channel, const FString& Sender, const FString& Kind, const FString& Body, bool bIsEvent);
	void   AppendSystem(const FString& Text);
	void   AppendMe(const FString& Channel, const FString& Sender, const FString& Body);

	void   RebuildTabs();
	void   AddTab(const FString& Channel);
	void   RemoveTab(const FString& Channel);
	void   RefreshTabStyles();
	void   MarkChannelUnread(const FString& Channel);

	bool   ExecuteSlashCommand(const FString& InputLine);
	void   PushHistory(const FString& Line);
	void   RecallHistoryDirection(int32 Direction);

	void   PersistGeometry();
	void   UpdateHeader();

	TWeakObjectPtr<UKBVESupabaseSubsystem> Subsystem;
	TWeakObjectPtr<AchuckCoreCharacter>    OwningCharacter;

	TSharedPtr<SKBVEMovableFrame> MovableFrame;
	TSharedPtr<SHorizontalBox>   TabRow;
	TSharedPtr<SScrollBox>       Scrollback;
	TSharedPtr<SEditableTextBox> InputBox;
	TSharedPtr<STextBlock>       HeaderText;
	FSimpleDelegate              OnCloseClicked;

	TArray<FChannelTab> Tabs;

	TArray<FString> InputHistory;
	int32 HistoryCursor = -1;
	FString DraftBeforeRecall;

	FString ActiveChannel;
	bool bConnected = false;
};
