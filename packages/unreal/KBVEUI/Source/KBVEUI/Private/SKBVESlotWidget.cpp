#include "SKBVESlotWidget.h"

#include "FKBVEDragOp.h"
#include "KBVEUIRenderer.h"
#include "Rendering/DrawElements.h"
#include "Styling/AppStyle.h"
#include "Styling/CoreStyle.h"
#include "Widgets/Layout/SBox.h"

void SKBVESlotWidget::Construct(const FArguments& InArgs)
{
	SlotSize         = InArgs._SlotSize;
	OnIsFilled       = InArgs._OnIsFilled;
	OnGetBorderColor = InArgs._OnGetBorderColor;
	OnGetCount       = InArgs._OnGetCount;
	OnPaintIcon      = InArgs._OnPaintIcon;
	OnClicked        = InArgs._OnClicked;
	OnRightClicked       = InArgs._OnRightClicked;
	OnShiftRightClicked  = InArgs._OnShiftRightClicked;
	OnHover          = InArgs._OnHover;
	OnGetPayloadKey   = InArgs._OnGetPayloadKey;
	OnBuildDecorator  = InArgs._OnBuildDecorator;
	OnDropped         = InArgs._OnDropped;
	OnDroppedOutside  = InArgs._OnDroppedOutside;
	DragDomain        = InArgs._DragDomain;
	SlotIndex         = InArgs._SlotIndex;
	AcceptedDomains   = InArgs._AcceptedDomains;
	if (AcceptedDomains.Num() == 0 && !DragDomain.IsNone())
	{
		AcceptedDomains.Add(DragDomain);
	}

	// Filling SBox in ChildSlot gives Slate a hit-test target the same size
	// as the slot. Custom OnPaint draws on top of it; SBox itself is empty
	// + transparent. Without this the widget renders but receives no mouse
	// enter/leave or drag events.
	ChildSlot
	[
		SNew(SBox)
		.WidthOverride(SlotSize)
		.HeightOverride(SlotSize)
	];

	SetCanTick(false);
}

void SKBVESlotWidget::OnMouseEnter(const FGeometry& Geometry, const FPointerEvent& Mouse)
{
	SCompoundWidget::OnMouseEnter(Geometry, Mouse);
	OnHover.ExecuteIfBound(true, Mouse.GetScreenSpacePosition());
}

void SKBVESlotWidget::OnMouseLeave(const FPointerEvent& Mouse)
{
	SCompoundWidget::OnMouseLeave(Mouse);
	OnHover.ExecuteIfBound(false, Mouse.GetScreenSpacePosition());
}

FVector2D SKBVESlotWidget::ComputeDesiredSize(float) const
{
	return FVector2D(SlotSize, SlotSize);
}

FReply SKBVESlotWidget::OnMouseButtonDown(const FGeometry& Geometry, const FPointerEvent& Mouse)
{
	if (Mouse.GetEffectingButton() == EKeys::RightMouseButton)
	{
		return FReply::Handled();
	}
	if (Mouse.GetEffectingButton() != EKeys::LeftMouseButton)
	{
		return FReply::Unhandled();
	}
	const bool bFilled = OnIsFilled.IsBound() ? OnIsFilled.Execute() : false;
	if (bFilled && !DragDomain.IsNone())
	{
		return FReply::Handled().DetectDrag(SharedThis(this), EKeys::LeftMouseButton);
	}
	return FReply::Handled();
}

FReply SKBVESlotWidget::OnMouseButtonUp(const FGeometry& Geometry, const FPointerEvent& Mouse)
{
	if (Mouse.GetEffectingButton() == EKeys::LeftMouseButton)
	{
		OnClicked.ExecuteIfBound();
	}
	else if (Mouse.GetEffectingButton() == EKeys::RightMouseButton)
	{
		if (Mouse.IsShiftDown() && OnShiftRightClicked.IsBound())
		{
			OnShiftRightClicked.Execute();
		}
		else
		{
			OnRightClicked.ExecuteIfBound();
		}
	}
	return FReply::Handled();
}

FReply SKBVESlotWidget::OnDragDetected(const FGeometry& Geometry, const FPointerEvent& Mouse)
{
	if (DragDomain.IsNone() || SlotIndex == INDEX_NONE)
	{
		return FReply::Unhandled();
	}
	const int32 Payload = OnGetPayloadKey.IsBound() ? OnGetPayloadKey.Execute() : 0;
	if (Payload <= 0)
	{
		return FReply::Unhandled();
	}
	TSharedPtr<SWidget> Decorator = OnBuildDecorator.IsBound() ? OnBuildDecorator.Execute() : nullptr;
	bBeingDragged = true;
	TSharedRef<FKBVEDragOp> Op = FKBVEDragOp::New(DragDomain, SlotIndex, Payload, Decorator, SharedThis(this));
	TWeakPtr<SKBVESlotWidget> WeakSelf = SharedThis(this);
	Op->OnEnded = [WeakSelf]()
	{
		if (TSharedPtr<SKBVESlotWidget> Pinned = WeakSelf.Pin())
		{
			Pinned->bBeingDragged = false;
			Pinned->bDragHovered  = false;
		}
	};
	if (OnDroppedOutside.IsBound())
	{
		FOnKBVESlotDroppedOutside OutsideCb = OnDroppedOutside;
		Op->OnDroppedOutside = [OutsideCb](const FVector2D& ScreenPos)
		{
			OutsideCb.ExecuteIfBound(ScreenPos);
		};
	}
	return FReply::Handled().BeginDragDrop(Op);
}

void SKBVESlotWidget::OnDragEnter(const FGeometry& Geometry, const FDragDropEvent& Event)
{
	TSharedPtr<FKBVEDragOp> Op = Event.GetOperationAs<FKBVEDragOp>();
	if (Op.IsValid() && AcceptedDomains.Contains(Op->Domain) && !(Op->Domain == DragDomain && Op->SourceIndex == SlotIndex))
	{
		bDragHovered = true;
		Op->HoverWidget = SharedThis(this);
	}
}

void SKBVESlotWidget::OnDragLeave(const FDragDropEvent& Event)
{
	bDragHovered = false;
	TSharedPtr<FKBVEDragOp> Op = Event.GetOperationAs<FKBVEDragOp>();
	if (Op.IsValid())
	{
		if (TSharedPtr<SWidget> H = Op->HoverWidget.Pin())
		{
			if (H.Get() == this)
			{
				Op->HoverWidget.Reset();
			}
		}
	}
}

FReply SKBVESlotWidget::OnDragOver(const FGeometry& Geometry, const FDragDropEvent& Event)
{
	TSharedPtr<FKBVEDragOp> Op = Event.GetOperationAs<FKBVEDragOp>();
	if (!Op.IsValid() || !AcceptedDomains.Contains(Op->Domain))
	{
		return FReply::Unhandled();
	}
	return FReply::Handled();
}

FReply SKBVESlotWidget::OnDrop(const FGeometry& Geometry, const FDragDropEvent& Event)
{
	bDragHovered = false;
	TSharedPtr<FKBVEDragOp> Op = Event.GetOperationAs<FKBVEDragOp>();
	if (!Op.IsValid() || !AcceptedDomains.Contains(Op->Domain))
	{
		return FReply::Unhandled();
	}
	if (Op->Domain == DragDomain && Op->SourceIndex == SlotIndex)
	{
		Op->bDropHandled = true;
		return FReply::Unhandled();
	}
	Op->bDropHandled = true;
	OnDropped.ExecuteIfBound(Op->SourceIndex, Op->Domain);
	return FReply::Handled();
}

int32 SKBVESlotWidget::OnPaint(
	const FPaintArgs& Args,
	const FGeometry& AllottedGeometry,
	const FSlateRect& MyCullingRect,
	FSlateWindowElementList& OutDrawElements,
	int32 LayerId,
	const FWidgetStyle& InWidgetStyle,
	bool bParentEnabled) const
{
	const FVector2D Size = AllottedGeometry.GetLocalSize();
	const FSlateBrush* WhiteBrush = FCoreStyle::Get().GetBrush("WhiteBrush");

	const FLinearColor BgEmpty (0.08f, 0.10f, 0.13f, 0.18f);
	const FLinearColor BgFilled(0.10f, 0.10f, 0.12f, 0.92f);
	const FLinearColor BorderEmpty(0.85f, 0.90f, 1.00f, 0.22f);
	const FLinearColor HighlightEmpty(1.00f, 1.00f, 1.00f, 0.06f);

	const bool bFilled = OnIsFilled.IsBound() ? OnIsFilled.Execute() : false;
	FLinearColor Border = bFilled
		? (OnGetBorderColor.IsBound() ? OnGetBorderColor.Execute() : FLinearColor::White)
		: BorderEmpty;
	if (bDragHovered)
	{
		Border = FLinearColor(1.f, 0.95f, 0.40f, 1.f);
	}
	const float SourceFade = bBeingDragged ? 0.35f : 1.f;

	FSlateDrawElement::MakeBox(
		OutDrawElements, LayerId,
		AllottedGeometry.ToPaintGeometry(),
		WhiteBrush, ESlateDrawEffect::None, Border);

	const FVector2D Inset(2.f, 2.f);
	FSlateDrawElement::MakeBox(
		OutDrawElements, LayerId + 1,
		AllottedGeometry.ToPaintGeometry(Size - Inset * 2.f, FSlateLayoutTransform(Inset)),
		WhiteBrush, ESlateDrawEffect::None,
		bFilled ? BgFilled : BgEmpty);

	if (!bFilled)
	{
		const FVector2D HighlightSize(Size.X - Inset.X * 2.f, (Size.Y - Inset.Y * 2.f) * 0.45f);
		FSlateDrawElement::MakeBox(
			OutDrawElements, LayerId + 2,
			AllottedGeometry.ToPaintGeometry(HighlightSize, FSlateLayoutTransform(Inset)),
			WhiteBrush, ESlateDrawEffect::None, HighlightEmpty);
		return LayerId + 3;
	}

	if (OnPaintIcon.IsBound() && !bBeingDragged)
	{
		OnPaintIcon.Execute(AllottedGeometry, OutDrawElements, LayerId + 2, Size);
	}

	const int32 Count = OnGetCount.IsBound() ? OnGetCount.Execute() : 0;
	if (Count > 1)
	{
		FSlateFontInfo CountFont = FAppStyle::Get().GetFontStyle("NormalText");
		CountFont.Size = 12;
		CountFont.OutlineSettings.OutlineSize = 1;
		CountFont.OutlineSettings.OutlineColor = FLinearColor(0.f, 0.f, 0.f, 1.f);
		const FString CountText = FString::Printf(TEXT("%d"), Count);
		KBVEUI::DrawText(
			OutDrawElements, AllottedGeometry, LayerId + 4,
			FVector2D(Size.X - 18.f, Size.Y - 14.f),
			CountText, CountFont, FLinearColor::White);
	}

	return LayerId + 5;
}
