#include "SKBVEStatBarStack.h"

#include "KBVEUIRenderer.h"
#include "Styling/CoreStyle.h"

void SKBVEStatBarStack::Construct(const FArguments& InArgs)
{
	BarWidth  = InArgs._BarWidth;
	BarHeight = InArgs._BarHeight;
	Spacing   = InArgs._Spacing;
	Padding   = InArgs._Padding;
	Anchor    = InArgs._Anchor;
	LabelFont = InArgs._LabelFont;
	Bars      = InArgs._Bars;

	if (LabelFont.Size <= 0.f)
	{
		LabelFont = FCoreStyle::GetDefaultFontStyle("Bold", 14);
		LabelFont.OutlineSettings.OutlineSize = 1;
		LabelFont.OutlineSettings.OutlineColor = FLinearColor(0.f, 0.f, 0.f, 1.f);
	}

	SetCanTick(false);
}

int32 SKBVEStatBarStack::OnPaint(
	const FPaintArgs& Args,
	const FGeometry& AllottedGeometry,
	const FSlateRect& MyCullingRect,
	FSlateWindowElementList& OutDrawElements,
	int32 LayerId,
	const FWidgetStyle& InWidgetStyle,
	bool bParentEnabled) const
{
	const FVector2D Size = AllottedGeometry.GetLocalSize();
	const FVector2D BarSize(BarWidth, BarHeight);
	const float Slant = BarHeight * 0.5f;

	const int32 N = Bars.Num();
	const float StackHeight = (N > 0) ? (BarHeight * N + Spacing * FMath::Max(0, N - 1)) : 0.f;
	const float X = Padding.Left;
	const float YBase = (Anchor == VAlign_Top)
		? Padding.Top
		: (Size.Y - Padding.Bottom - StackHeight);

	const float TextY = (BarHeight - LabelFont.Size) * 0.5f - 3.f;
	const float TextX = Slant + 8.f;

	const FLinearColor TextColor(1.f, 1.f, 1.f, 0.95f);

	int32 Layer = LayerId;
	for (int32 i = 0; i < N; ++i)
	{
		const FKBVEStatBarSpec& B = Bars[i];

		const float Alpha = B.RowAlpha.IsBound() ? B.RowAlpha.Get() : 1.f;
		FLinearColor Fill = B.FillColor.Get(FLinearColor::White);
		FLinearColor Bg   = B.BackgroundColor.Get(FLinearColor(0.06f, 0.06f, 0.06f, 0.85f));
		Fill.A *= Alpha;
		Bg.A   *= Alpha;

		const FVector2D BarPos (X, YBase + i * (BarHeight + Spacing));
		const FVector2D TextPos(BarPos.X + TextX, BarPos.Y + TextY);

		KBVEUI::DrawSlantedBar(
			OutDrawElements, AllottedGeometry, Layer,
			BarPos, BarSize, Slant, B.Percent.Get(0.f), Fill, Bg);

		FLinearColor RowText = TextColor; RowText.A *= Alpha;
		const FString Text = FString::Printf(
			TEXT("%s  %.0f/%.0f"),
			*B.Label, B.Current.Get(0.f), B.Max.Get(0.f));
		KBVEUI::DrawText(
			OutDrawElements, AllottedGeometry, Layer + 2,
			TextPos, Text, LabelFont, RowText);

		Layer += 4;
	}

	return Layer;
}
