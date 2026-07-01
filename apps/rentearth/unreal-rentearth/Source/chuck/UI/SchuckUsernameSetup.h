#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"

class UKBVESupabaseSubsystem;
class UchuckKbveApiClient;
class SEditableTextBox;
class STextBlock;
class SButton;

DECLARE_DELEGATE_OneParam(FchuckOnUsernameSet, const FString&);

class SchuckUsernameSetup : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckUsernameSetup) {}
		SLATE_ARGUMENT(TWeakObjectPtr<UKBVESupabaseSubsystem>, Subsystem)
		SLATE_ARGUMENT(TWeakObjectPtr<UchuckKbveApiClient>, ApiClient)
		SLATE_EVENT(FchuckOnUsernameSet, OnUsernameSet)
		SLATE_EVENT(FSimpleDelegate, OnSessionExpired)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	FReply HandleConfirm();
	void SetStatus(const FText& Text);
	void SetBusy(bool bInBusy);

	TWeakObjectPtr<UKBVESupabaseSubsystem> Subsystem;
	TWeakObjectPtr<UchuckKbveApiClient> ApiClient;
	FchuckOnUsernameSet OnUsernameSet;
	FSimpleDelegate OnSessionExpired;
	TSharedPtr<SEditableTextBox> NameBox;
	TSharedPtr<STextBlock> StatusText;
	TSharedPtr<SButton> ConfirmButton;
	bool bBusy = false;
};
