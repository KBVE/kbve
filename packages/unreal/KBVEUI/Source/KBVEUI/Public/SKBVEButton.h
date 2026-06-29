#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Framework/SlateDelegates.h"
#include "Input/Reply.h"

class KBVEUI_API SKBVEButton : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEButton)
		: _StyleName("KBVE.Button.Primary")
		, _TextStyleName("KBVE.Text.Body")
		, _HAlign(HAlign_Center)
	{}
		SLATE_ARGUMENT(FName, StyleName)
		SLATE_ARGUMENT(FName, TextStyleName)
		SLATE_ARGUMENT(EHorizontalAlignment, HAlign)
		SLATE_ATTRIBUTE(FText, Text)
		SLATE_ATTRIBUTE(bool, IsEnabled)
		SLATE_EVENT(FOnClicked, OnClicked)
		SLATE_NAMED_SLOT(FArguments, Content)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	FReply HandleClicked();

	FOnClicked OnClicked;
};
