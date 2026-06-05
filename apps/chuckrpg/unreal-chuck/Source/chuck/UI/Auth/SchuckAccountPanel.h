#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Input/Reply.h"

class UKBVESupabaseSubsystem;
class STextBlock;

/** Small overlay tile in the corner — shows the active KBVE username and a sign-out affordance. */
class SchuckAccountPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckAccountPanel) {}
		SLATE_ARGUMENT(TWeakObjectPtr<UKBVESupabaseSubsystem>, Subsystem)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	void SetUsername(const FString& InUsername);
	void SetEmail(const FString& InEmail);

private:
	FReply HandleSignOut();

	TWeakObjectPtr<UKBVESupabaseSubsystem> Subsystem;
	TSharedPtr<STextBlock> UsernameText;
	TSharedPtr<STextBlock> EmailText;
};
