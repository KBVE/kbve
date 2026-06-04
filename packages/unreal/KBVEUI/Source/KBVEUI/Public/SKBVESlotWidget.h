#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Input/Reply.h"

DECLARE_DELEGATE_RetVal(bool, FOnKBVESlotIsFilled);
DECLARE_DELEGATE_RetVal(FLinearColor, FOnKBVESlotBorderColor);
DECLARE_DELEGATE_RetVal(int32, FOnKBVESlotCount);
DECLARE_DELEGATE_FourParams(
	FOnKBVESlotPaintIcon,
	const FGeometry& /*Geometry*/,
	FSlateWindowElementList& /*OutDrawElements*/,
	int32 /*Layer*/,
	const FVector2D& /*SlotSize*/);
DECLARE_DELEGATE(FOnKBVESlotClicked);

class KBVEUI_API SKBVESlotWidget : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVESlotWidget)
		: _SlotSize(64.f)
	{}
		SLATE_ARGUMENT(float, SlotSize)
		SLATE_EVENT(FOnKBVESlotIsFilled, OnIsFilled)
		SLATE_EVENT(FOnKBVESlotBorderColor, OnGetBorderColor)
		SLATE_EVENT(FOnKBVESlotCount, OnGetCount)
		SLATE_EVENT(FOnKBVESlotPaintIcon, OnPaintIcon)
		SLATE_EVENT(FOnKBVESlotClicked, OnClicked)
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

	virtual FVector2D ComputeDesiredSize(float) const override;
	virtual FReply OnMouseButtonDown(const FGeometry& Geometry, const FPointerEvent& Mouse) override;

private:
	float SlotSize = 64.f;
	FOnKBVESlotIsFilled    OnIsFilled;
	FOnKBVESlotBorderColor OnGetBorderColor;
	FOnKBVESlotCount       OnGetCount;
	FOnKBVESlotPaintIcon   OnPaintIcon;
	FOnKBVESlotClicked     OnClicked;
};
