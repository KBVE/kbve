#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Layout/Margin.h"

class KBVEUI_API SKBVEPanelChrome : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEPanelChrome)
		: _BackgroundName("KBVE.Brush.Panel")
		, _ContentPadding(FMargin(8.f))
		, _bDeep(false)
	{}
		SLATE_ARGUMENT(FName, BackgroundName)
		SLATE_ARGUMENT(FMargin, ContentPadding)
		SLATE_ARGUMENT(bool, bDeep)
		SLATE_ATTRIBUTE(FText, Title)
		SLATE_DEFAULT_SLOT(FArguments, Content)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
};
