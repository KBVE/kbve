#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Input/Reply.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Text/STextBlock.h"

class UKBVESupabaseSubsystem;
class SEditableTextBox;
class STextBlock;

class KBVEUIAUTH_API SKBVELoginWidget : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVELoginWidget)
		: _Title(NSLOCTEXT("SKBVELoginWidget", "DefaultTitle", "Sign In"))
	{}
		SLATE_ARGUMENT(TWeakObjectPtr<UKBVESupabaseSubsystem>, Subsystem)
		SLATE_ARGUMENT(FText, Title)
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
