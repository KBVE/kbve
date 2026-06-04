#include "SKBVETooltip.h"

#include "Styling/CoreStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Text/STextBlock.h"

void SKBVETooltip::Construct(const FArguments& InArgs)
{
	FSlateFontInfo Font = InArgs._Font;
	if (Font.Size <= 0.f)
	{
		Font = FCoreStyle::GetDefaultFontStyle("Regular", 12);
		Font.OutlineSettings.OutlineSize = 1;
		Font.OutlineSettings.OutlineColor = FLinearColor(0.f, 0.f, 0.f, 1.f);
	}

	const FSlateBrush* WhiteBrush = FCoreStyle::Get().GetBrush("WhiteBrush");

	ChildSlot
	[
		SNew(SBox)
		.Visibility(this, &SKBVETooltip::GetVisibility)
		.RenderTransform(TAttribute<TOptional<FSlateRenderTransform>>::CreateLambda([this]() -> TOptional<FSlateRenderTransform> {
			return FSlateRenderTransform(CurrentPos + FVector2D(14.f, 14.f));
		}))
		[
			SNew(SOverlay)

			+ SOverlay::Slot()
			[
				SNew(SImage)
				.Image(WhiteBrush)
				.ColorAndOpacity(FLinearColor(0.04f, 0.05f, 0.07f, 0.92f))
			]

			+ SOverlay::Slot()
			.Padding(FMargin(8.f, 5.f))
			[
				SNew(STextBlock)
				.Text(this, &SKBVETooltip::GetText)
				.Font(Font)
				.ColorAndOpacity(FLinearColor(0.92f, 0.92f, 0.95f, 1.f))
				.AutoWrapText(false)
			]
		]
	];

	SetCanTick(false);
}

void SKBVETooltip::Show(const FText& InText, const FVector2D& ScreenPos)
{
	CurrentText = InText;
	CurrentPos  = ScreenPos;
	bShown = true;
	Invalidate(EInvalidateWidgetReason::Layout);
}

void SKBVETooltip::Hide()
{
	bShown = false;
	Invalidate(EInvalidateWidgetReason::Layout);
}

EVisibility SKBVETooltip::GetVisibility() const
{
	return bShown ? EVisibility::HitTestInvisible : EVisibility::Collapsed;
}

FVector2D SKBVETooltip::GetRenderTransform() const
{
	return CurrentPos + FVector2D(14.f, 14.f);
}

FText SKBVETooltip::GetText() const
{
	return CurrentText;
}
