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
DECLARE_DELEGATE(FOnKBVESlotRightClicked);
DECLARE_DELEGATE(FOnKBVESlotShiftRightClicked);
DECLARE_DELEGATE_TwoParams(FOnKBVESlotHover, bool /*bEntered*/, const FVector2D& /*ScreenPos*/);
DECLARE_DELEGATE_RetVal(int32, FOnKBVESlotPayloadKey);
DECLARE_DELEGATE_RetVal(TSharedPtr<SWidget>, FOnKBVESlotBuildDecorator);
DECLARE_DELEGATE_TwoParams(FOnKBVESlotDropped, int32 /*SourceSlotIndex*/, FName /*SourceDomain*/);
DECLARE_DELEGATE_OneParam(FOnKBVESlotDroppedOutside, const FVector2D& /*ScreenPos*/);

class KBVEUI_API SKBVESlotWidget : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVESlotWidget)
		: _SlotSize(64.f)
	{}
		SLATE_ATTRIBUTE(float, SlotSize)
		SLATE_EVENT(FOnKBVESlotIsFilled, OnIsFilled)
		SLATE_EVENT(FOnKBVESlotBorderColor, OnGetBorderColor)
		SLATE_EVENT(FOnKBVESlotCount, OnGetCount)
		SLATE_EVENT(FOnKBVESlotPaintIcon, OnPaintIcon)
		SLATE_EVENT(FOnKBVESlotClicked, OnClicked)
		SLATE_EVENT(FOnKBVESlotRightClicked, OnRightClicked)
		SLATE_EVENT(FOnKBVESlotShiftRightClicked, OnShiftRightClicked)
		SLATE_EVENT(FOnKBVESlotHover, OnHover)
		SLATE_EVENT(FOnKBVESlotPayloadKey, OnGetPayloadKey)
		SLATE_EVENT(FOnKBVESlotBuildDecorator, OnBuildDecorator)
		SLATE_EVENT(FOnKBVESlotDropped, OnDropped)
		SLATE_EVENT(FOnKBVESlotDroppedOutside, OnDroppedOutside)
		SLATE_ARGUMENT(FName, DragDomain)
		SLATE_ARGUMENT(int32, SlotIndex)
		SLATE_ARGUMENT(TArray<FName>, AcceptedDomains)
		SLATE_ATTRIBUTE(FString, KeyLabel)
		SLATE_ATTRIBUTE(FLinearColor, BgFilledColor)
		SLATE_ATTRIBUTE(FLinearColor, BgEmptyColor)
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
	virtual FReply OnDragOver(const FGeometry& Geometry, const FDragDropEvent& Event) override;
	virtual FReply OnDrop(const FGeometry& Geometry, const FDragDropEvent& Event) override;
	virtual void OnDragEnter(const FGeometry& Geometry, const FDragDropEvent& Event) override;
	virtual void OnDragLeave(const FDragDropEvent& Event) override;
	virtual void OnMouseEnter(const FGeometry& Geometry, const FPointerEvent& Mouse) override;
	virtual void OnMouseLeave(const FPointerEvent& Mouse) override;

	bool IsAcceptingDragHover() const { return bDragHovered; }
	bool IsBeingDragged()       const { return bBeingDragged; }

private:
	TAttribute<float> SlotSize;
	int32 SlotIndex = INDEX_NONE;
	FName DragDomain;
	TArray<FName> AcceptedDomains;
	FOnKBVESlotIsFilled       OnIsFilled;
	FOnKBVESlotBorderColor    OnGetBorderColor;
	FOnKBVESlotCount          OnGetCount;
	FOnKBVESlotPaintIcon      OnPaintIcon;
	FOnKBVESlotClicked        OnClicked;
	FOnKBVESlotRightClicked       OnRightClicked;
	FOnKBVESlotShiftRightClicked  OnShiftRightClicked;
	FOnKBVESlotHover          OnHover;
	FOnKBVESlotPayloadKey     OnGetPayloadKey;
	FOnKBVESlotBuildDecorator OnBuildDecorator;
	FOnKBVESlotDropped        OnDropped;
	FOnKBVESlotDroppedOutside OnDroppedOutside;
	TAttribute<FString>       KeyLabel;
	TAttribute<FLinearColor>  BgFilledColor;
	TAttribute<FLinearColor>  BgEmptyColor;
	mutable bool bDragHovered = false;
	mutable bool bBeingDragged = false;
};
