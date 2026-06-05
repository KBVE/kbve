#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Input/Reply.h"
#include "chuckEventPayloads.h"

class UKBVESupabaseSubsystem;
class SEditableTextBox;
class SScrollBox;
class STextBlock;

/**
 * Scrollback + input dock for the irc-gateway WebSocket. Listens to the
 * chuck event bus (ChatState / ChatLine) so the widget never touches the
 * Supabase subsystem directly except to send PRIVMSGs.
 */
class SchuckChatPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckChatPanel)
		: _DefaultChannel(TEXT("#global"))
	{}
		SLATE_ARGUMENT(TWeakObjectPtr<UKBVESupabaseSubsystem>, Subsystem)
		SLATE_ARGUMENT(FString, DefaultChannel)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	void OnChatStateChanged(const FchuckChatStatePayload& Payload);
	void OnChatLine(const FchuckChatLinePayload& Payload);

	void SetActiveChannel(const FString& InChannel);

private:
	FReply HandleSendClicked();
	void   HandleInputCommitted(const FText& InText, ETextCommit::Type CommitType);
	void   AppendLine(const FString& Channel, const FString& Sender, const FString& Kind, const FString& Body, bool bIsEvent);
	void   AppendSystem(const FString& Text);

	TWeakObjectPtr<UKBVESupabaseSubsystem> Subsystem;
	TSharedPtr<SScrollBox> Scrollback;
	TSharedPtr<SEditableTextBox> InputBox;
	TSharedPtr<STextBlock> HeaderText;

	FString ActiveChannel;
	bool bConnected = false;
};
