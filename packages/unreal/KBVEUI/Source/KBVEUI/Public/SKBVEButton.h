#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Framework/SlateDelegates.h"
#include "Fonts/SlateFontInfo.h"
#include "Layout/Margin.h"
#include "Input/Reply.h"

class KBVEUI_API SKBVEButton : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEButton)
		: _StyleName("KBVE.Button.Primary")
		, _TextStyleName("KBVE.Text.Body")
		, _ContentPadding(FMargin(12.f, 6.f))
		, _HAlign(HAlign_Center)
	{}
		SLATE_ARGUMENT(FName, StyleName)
		SLATE_ARGUMENT(FName, TextStyleName)
		SLATE_ARGUMENT(FSlateFontInfo, Font)
		SLATE_ARGUMENT(FMargin, ContentPadding)
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
