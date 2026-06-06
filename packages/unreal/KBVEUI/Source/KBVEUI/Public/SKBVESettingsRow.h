#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Styling/SlateColor.h"

class KBVEUI_API SKBVESettingsRow : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVESettingsRow)
		: _LabelWidth(220.f)
	{}
		SLATE_ARGUMENT(float, LabelWidth)
		SLATE_ATTRIBUTE(FText, Label)
		SLATE_ATTRIBUTE(FText, Hint)
		SLATE_ATTRIBUTE(FSlateColor, LabelColor)
		SLATE_NAMED_SLOT(FArguments, Content)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
};
