#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Input/Reply.h"
#include "Framework/SlateDelegates.h"

class SchuckPauseMenu : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckPauseMenu) {}
		SLATE_EVENT(FSimpleDelegate, OnResumeClicked)
		SLATE_EVENT(FSimpleDelegate, OnQuitToMenuClicked)
		SLATE_EVENT(FSimpleDelegate, OnQuitClicked)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	TSharedRef<SWidget> BuildMenuButton(
		const FText& Label,
		const FOnClicked& ClickHandler,
		const FSlateFontInfo& Font);

	FReply HandleResume();
	FReply HandleQuitToMenu();
	FReply HandleQuit();

	FSimpleDelegate OnResume;
	FSimpleDelegate OnQuitToMenu;
	FSimpleDelegate OnQuit;
};
