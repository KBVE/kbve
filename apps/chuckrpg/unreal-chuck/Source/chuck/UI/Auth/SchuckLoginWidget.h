#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Input/Reply.h"

class UKBVESupabaseSubsystem;
class SEditableTextBox;
class STextBlock;

/**
 * Modal login panel. Sign-in / sign-up / OAuth bootstrap (Discord, GitHub,
 * Google) hooked straight to UKBVESupabaseSubsystem. Auth state changes are
 * surfaced via the chuck event bus (FchuckAuthStatusPayload), so this widget
 * just drives the subsystem and renders status text.
 */
class SchuckLoginWidget : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckLoginWidget) {}
		SLATE_ARGUMENT(TWeakObjectPtr<UKBVESupabaseSubsystem>, Subsystem)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	void SetStatusText(const FText& InText, const FLinearColor& InColor);
	void SetBusy(bool bBusy);

private:
	FReply HandleSignIn();
	FReply HandleSignUp();
	FReply HandleOAuth(int32 ProviderIndex);
	FReply HandleAnonymous();

	TWeakObjectPtr<UKBVESupabaseSubsystem> Subsystem;
	TSharedPtr<SEditableTextBox> EmailBox;
	TSharedPtr<SEditableTextBox> PasswordBox;
	TSharedPtr<STextBlock>       StatusText;
	bool bBusy = false;
};
