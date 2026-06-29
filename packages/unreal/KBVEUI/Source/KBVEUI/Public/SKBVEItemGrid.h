#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Layout/Margin.h"

DECLARE_DELEGATE_RetVal_OneParam(TSharedRef<SWidget>, FOnKBVEItemGridBuildSlot, int32);

class KBVEUI_API SKBVEItemGrid : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEItemGrid)
		: _Columns(4)
		, _Rows(6)
		, _SlotPadding(FMargin(6.f))
	{}
		SLATE_ARGUMENT(int32, Columns)
		SLATE_ARGUMENT(int32, Rows)
		SLATE_ARGUMENT(FMargin, SlotPadding)
		SLATE_EVENT(FOnKBVEItemGridBuildSlot, OnBuildSlot)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
};
