#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

class KBVEUI_API SKBVELabel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVELabel)
		: _StyleName("KBVE.Text.Body")
		, _Justification(ETextJustify::Left)
		, _AutoWrap(false)
	{}
		SLATE_ARGUMENT(FName, StyleName)
		SLATE_ARGUMENT(ETextJustify::Type, Justification)
		SLATE_ARGUMENT(bool, AutoWrap)
		SLATE_ATTRIBUTE(FText, Text)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
};
