#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Input/Reply.h"

DECLARE_DELEGATE_RetVal(bool, FOnKBVESlotIsFilled);
DECLARE_DELEGATE_RetVal(FLinearColor, FOnKBVESlotBorderColor);
DECLARE_DELEGATE_RetVal(int32, FOnKBVESlotCount);
DECLARE_DELEGATE_RetVal(FText, FOnKBVESlotTooltip);
DECLARE_DELEGATE_FourParams(
	FOnKBVESlotPaintIcon,
	const FGeometry& /*Geometry*/,
	FSlateWindowElementList& /*OutDrawElements*/,
	int32 /*Layer*/,
	const FVector2D& /*SlotSize*/);
DECLARE_DELEGATE(FOnKBVESlotClicked);
DECLARE_DELEGATE_TwoParams(FOnKBVESlotHover, bool /*bEntered*/, const FVector2D& /*ScreenPos*/);
DECLARE_DELEGATE_RetVal(int32, FOnKBVESlotPayloadKey);
DECLARE_DELEGATE_OneParam(FOnKBVESlotDropped, int32 /*SourceSlotIndex*/);

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
		SLATE_EVENT(FOnKBVESlotHover, OnHover)
		SLATE_EVENT(FOnKBVESlotPayloadKey, OnGetPayloadKey)
		SLATE_EVENT(FOnKBVESlotDropped, OnDropped)
		SLATE_ARGUMENT(FName, DragDomain)
		SLATE_ARGUMENT(int32, SlotIndex)
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
	virtual FReply OnMouseButtonUp(const FGeometry& Geometry, const FPointerEvent& Mouse) override;
	virtual FReply OnDragDetected(const FGeometry& Geometry, const FPointerEvent& Mouse) override;
	virtual FReply OnDrop(const FGeometry& Geometry, const FDragDropEvent& Event) override;
	virtual void OnMouseEnter(const FGeometry& Geometry, const FPointerEvent& Mouse) override;
	virtual void OnMouseLeave(const FPointerEvent& Mouse) override;

private:
	float SlotSize = 64.f;
	int32 SlotIndex = INDEX_NONE;
	FName DragDomain;
	FOnKBVESlotIsFilled    OnIsFilled;
	FOnKBVESlotBorderColor OnGetBorderColor;
	FOnKBVESlotCount       OnGetCount;
	FOnKBVESlotPaintIcon   OnPaintIcon;
	FOnKBVESlotClicked     OnClicked;
	FOnKBVESlotHover       OnHover;
	FOnKBVESlotPayloadKey  OnGetPayloadKey;
	FOnKBVESlotDropped     OnDropped;
};
