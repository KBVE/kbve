#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Styling/SlateColor.h"

class KBVEUI_API SKBVETopBar : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVETopBar)
		: _BarHeight(50.f)
	{}
		SLATE_ARGUMENT(float, BarHeight)
		SLATE_ATTRIBUTE(FSlateColor, BackgroundColor)
		SLATE_NAMED_SLOT(FArguments, Left)
		SLATE_NAMED_SLOT(FArguments, Center)
		SLATE_NAMED_SLOT(FArguments, Right)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
};
