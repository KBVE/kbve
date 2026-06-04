#include "SKBVESlotWidget.h"

#include "KBVEUIRenderer.h"
#include "Rendering/DrawElements.h"
#include "Styling/CoreStyle.h"

void SKBVESlotWidget::Construct(const FArguments& InArgs)
{
	SlotSize         = InArgs._SlotSize;
	OnIsFilled       = InArgs._OnIsFilled;
	OnGetBorderColor = InArgs._OnGetBorderColor;
	OnGetCount       = InArgs._OnGetCount;
	OnPaintIcon      = InArgs._OnPaintIcon;
	OnClicked        = InArgs._OnClicked;
	OnHover          = InArgs._OnHover;

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
	if (Mouse.GetEffectingButton() != EKeys::LeftMouseButton)
	{
		return FReply::Unhandled();
	}
	OnClicked.ExecuteIfBound();
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
	const FLinearColor Border = bFilled
		? (OnGetBorderColor.IsBound() ? OnGetBorderColor.Execute() : FLinearColor::White)
		: BorderEmpty;

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

	if (OnPaintIcon.IsBound())
	{
		OnPaintIcon.Execute(AllottedGeometry, OutDrawElements, LayerId + 2, Size);
	}

	const int32 Count = OnGetCount.IsBound() ? OnGetCount.Execute() : 0;
	if (Count > 1)
	{
		const FSlateFontInfo CountFont = FCoreStyle::GetDefaultFontStyle("Bold", 12);
		const FString CountText = FString::Printf(TEXT("%d"), Count);
		KBVEUI::DrawText(
			OutDrawElements, AllottedGeometry, LayerId + 4,
			FVector2D(Size.X - 18.f, Size.Y - 14.f),
			CountText, CountFont, FLinearColor::White);
	}

	return LayerId + 5;
}
