#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Framework/SlateDelegates.h"
#include "Input/Reply.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Text/STextBlock.h"

class UKBVESupabaseSubsystem;
class SEditableTextBox;
class SScrollBox;
class SHorizontalBox;
class SBorder;
class STextBlock;
class SWidget;
class SKBVEMovableFrame;

struct FKBVEChatLineView
{
	FString Channel;
	FString Nick;
	FString Sender;
	FString Platform;
	FString Kind;
	FString Body;
	bool    bIsEvent = false;
};

DECLARE_DELEGATE_TwoParams(FKBVEChatGeometrySave, const FVector2D& /*Position*/, const FVector2D& /*Size*/);
DECLARE_DELEGATE_RetVal_TwoParams(bool, FKBVEChatGeometryLoad, FVector2D& /*OutPosition*/, FVector2D& /*OutSize*/);

/**
 * Chat window for the irc-gateway WebSocket. Wraps SKBVEMovableFrame for
 * drag / resize / close, renders channel tabs + scrollback + input, and
 * dispatches outbound commands through UKBVESupabaseSubsystem's chat object.
 * Inbound lines/state are pushed in via OnChatLine / OnChatStateChanged so the
 * game owns the event-bus wiring; geometry persistence is delegated out.
 */
class KBVEUICHAT_API SKBVEChatPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEChatPanel)
		: _DefaultChannel(TEXT("#general"))
	{}
		SLATE_ARGUMENT(TWeakObjectPtr<UKBVESupabaseSubsystem>, Subsystem)
		SLATE_ARGUMENT(FString, DefaultChannel)
		SLATE_ARGUMENT(FMargin, DockPadding)
		SLATE_EVENT(FSimpleDelegate, OnCloseClicked)
		SLATE_EVENT(FKBVEChatGeometrySave, OnSaveGeometry)
		SLATE_EVENT(FKBVEChatGeometryLoad, OnLoadGeometry)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	void OnChatStateChanged(bool bInConnected);
	void OnChatLine(const FKBVEChatLineView& Payload);
	void OnChannelJoined(const FString& Channel);
	void OnChannelLeft(const FString& Channel);

	void SetActiveChannel(const FString& InChannel);
	const FString& GetActiveChannel() const { return ActiveChannel; }

	bool ToggleVisible();
	void ShowAndFocusInput();

	void Dock();
	void Undock();
	bool IsDocked() const;

protected:
	virtual bool SupportsKeyboardFocus() const override { return true; }
	virtual FReply OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent) override;
	virtual FReply OnPreviewKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent) override;

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

	TSharedPtr<SKBVEMovableFrame> MovableFrame;
	TSharedPtr<SHorizontalBox>   TabRow;
	TSharedPtr<SScrollBox>       Scrollback;
	TSharedPtr<SEditableTextBox> InputBox;
	TSharedPtr<STextBlock>       HeaderText;
	FSimpleDelegate              OnCloseClicked;
	FKBVEChatGeometrySave        OnSaveGeometry;
	FKBVEChatGeometryLoad        OnLoadGeometry;

	TArray<FChannelTab> Tabs;

	TArray<FString> InputHistory;
	int32 HistoryCursor = -1;
	FString DraftBeforeRecall;

	FString ActiveChannel;
	bool bConnected = false;
};
