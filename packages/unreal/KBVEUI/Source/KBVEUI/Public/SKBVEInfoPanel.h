#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Styling/SlateColor.h"

DECLARE_DELEGATE_FourParams(
	FOnKBVEInfoPaintIcon,
	const FGeometry& /*Geometry*/,
	FSlateWindowElementList& /*OutDrawElements*/,
	int32 /*Layer*/,
	const FVector2D& /*IconRectSize*/);

class KBVEUI_API SKBVEInfoPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEInfoPanel)
		: _IconSize(96.f)
	{}
		SLATE_ARGUMENT(float, IconSize)
		SLATE_ATTRIBUTE(FText, Title)
		SLATE_ATTRIBUTE(FText, Subtitle)
		SLATE_ATTRIBUTE(FText, Detail)
		SLATE_ATTRIBUTE(FText, Body)
		SLATE_ATTRIBUTE(FText, EmptyHint)
		SLATE_ATTRIBUTE(FSlateColor, TitleColor)
		SLATE_ATTRIBUTE(bool, HasContent)
		SLATE_EVENT(FOnKBVEInfoPaintIcon, OnPaintIcon)
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
	EVisibility ContentVisibility() const;
	EVisibility HintVisibility() const;

	float IconSize = 96.f;
	TAttribute<bool> HasContent;
	FOnKBVEInfoPaintIcon OnPaintIcon;
};
