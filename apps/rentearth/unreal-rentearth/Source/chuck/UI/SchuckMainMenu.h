#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Input/Reply.h"
#include "Framework/SlateDelegates.h"

class SchuckMainMenu : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckMainMenu) {}
		SLATE_EVENT(FSimpleDelegate, OnPlayClicked)
		SLATE_EVENT(FSimpleDelegate, OnQuitClicked)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	TSharedRef<SWidget> BuildMenuButton(
		const FText& Label,
		const FOnClicked& ClickHandler,
		const FSlateFontInfo& Font);

	FReply HandlePlay();
	FReply HandleQuit();

	FSimpleDelegate OnPlay;
	FSimpleDelegate OnQuit;
};
