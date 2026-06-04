#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

struct FKBVEStatBarSpec
{
	FString      Label;
	TAttribute<float>         Percent;
	TAttribute<float>         Current;
	TAttribute<float>         Max;
	TAttribute<FLinearColor>  FillColor;
	TAttribute<FLinearColor>  BackgroundColor;
	TAttribute<float>         RowAlpha;
};

class KBVEUI_API SKBVEStatBarStack : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEStatBarStack)
		: _BarWidth(300.f)
		, _BarHeight(24.f)
		, _Spacing(8.f)
		, _Padding(FMargin(32.f))
		, _Anchor(EVerticalAlignment::VAlign_Bottom)
	{}
		SLATE_ARGUMENT(float, BarWidth)
		SLATE_ARGUMENT(float, BarHeight)
		SLATE_ARGUMENT(float, Spacing)
		SLATE_ARGUMENT(FMargin, Padding)
		SLATE_ARGUMENT(EVerticalAlignment, Anchor)
		SLATE_ARGUMENT(FSlateFontInfo, LabelFont)
		SLATE_ARGUMENT(TArray<FKBVEStatBarSpec>, Bars)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

protected:
	virtual int32 OnPaint(
		const FPaintArgs& Args,
		const FGeometry& AllottedGeometry,
		const FSlateRect& MyCullingRect,
		FSlateWindowElementList& OutDrawElements,
		int32 LayerId,
		const FWidgetStyle& InWidgetStyle,
		bool bParentEnabled) const override;

private:
	float BarWidth = 300.f;
	float BarHeight = 24.f;
	float Spacing = 8.f;
	FMargin Padding;
	EVerticalAlignment Anchor = EVerticalAlignment::VAlign_Bottom;
	FSlateFontInfo LabelFont;
	TArray<FKBVEStatBarSpec> Bars;
};
