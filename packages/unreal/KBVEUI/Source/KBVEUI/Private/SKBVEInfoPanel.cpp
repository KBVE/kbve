#include "SKBVEInfoPanel.h"

#include "Rendering/DrawElements.h"
#include "Styling/CoreStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Text/STextBlock.h"

void SKBVEInfoPanel::Construct(const FArguments& InArgs)
{
	IconSize     = InArgs._IconSize;
	HasContent   = InArgs._HasContent;
	OnPaintIcon  = InArgs._OnPaintIcon;

	const FSlateFontInfo TitleFont   = FCoreStyle::GetDefaultFontStyle("Bold", 18);
	const FSlateFontInfo MetaFont    = FCoreStyle::GetDefaultFontStyle("Regular", 11);
	const FSlateFontInfo BodyFont    = FCoreStyle::GetDefaultFontStyle("Regular", 12);
	const FSlateFontInfo HintFont    = FCoreStyle::GetDefaultFontStyle("Italic", 13);

	const FSlateBrush* WhiteBrush = FCoreStyle::Get().GetBrush("WhiteBrush");

	const float IconColumnWidth = IconSize + 14.f;

	ChildSlot
	[
		SNew(SOverlay)

		+ SOverlay::Slot()
		[
			SNew(SImage)
			.Image(WhiteBrush)
			.ColorAndOpacity(FLinearColor(0.03f, 0.04f, 0.06f, 0.90f))
		]

		+ SOverlay::Slot()
		.Padding(FMargin(14.f))
		[
			SNew(SVerticalBox)

			+ SVerticalBox::Slot()
			.AutoHeight()
			[
				SNew(STextBlock)
				.Visibility(this, &SKBVEInfoPanel::HintVisibility)
				.Text(InArgs._EmptyHint)
				.Font(HintFont)
				.ColorAndOpacity(FLinearColor(0.6f, 0.6f, 0.65f, 0.95f))
			]

			+ SVerticalBox::Slot()
			.FillHeight(1.f)
			[
				SNew(SVerticalBox)
				.Visibility(this, &SKBVEInfoPanel::ContentVisibility)

				+ SVerticalBox::Slot()
				.AutoHeight()
				[
					SNew(SHorizontalBox)

					+ SHorizontalBox::Slot()
					.AutoWidth()
					[
						SNew(SBox).WidthOverride(IconColumnWidth).HeightOverride(IconSize)
					]

					+ SHorizontalBox::Slot()
					.FillWidth(1.f)
					[
						SNew(SVerticalBox)

						+ SVerticalBox::Slot()
						.AutoHeight()
						.Padding(0.f, 0.f, 0.f, 6.f)
						[
							SNew(STextBlock)
							.Text(InArgs._Title)
							.Font(TitleFont)
							.ColorAndOpacity(InArgs._TitleColor)
							.AutoWrapText(true)
						]

						+ SVerticalBox::Slot()
						.AutoHeight()
						.Padding(0.f, 0.f, 0.f, 4.f)
						[
							SNew(STextBlock)
							.Text(InArgs._Subtitle)
							.Font(MetaFont)
							.ColorAndOpacity(FLinearColor(0.75f, 0.75f, 0.78f, 0.95f))
							.AutoWrapText(true)
						]

						+ SVerticalBox::Slot()
						.AutoHeight()
						[
							SNew(STextBlock)
							.Text(InArgs._Detail)
							.Font(MetaFont)
							.ColorAndOpacity(FLinearColor(0.75f, 0.75f, 0.78f, 0.95f))
							.AutoWrapText(true)
						]
					]
				]

				+ SVerticalBox::Slot()
				.FillHeight(1.f)
				.Padding(0.f, 14.f, 0.f, 0.f)
				[
					SNew(STextBlock)
					.Text(InArgs._Body)
					.Font(BodyFont)
					.ColorAndOpacity(FLinearColor(0.88f, 0.88f, 0.90f, 0.95f))
					.AutoWrapText(true)
					.Justification(ETextJustify::Left)
				]
			]
		]
	];
}

EVisibility SKBVEInfoPanel::ContentVisibility() const
{
	return HasContent.Get(false) ? EVisibility::Visible : EVisibility::Collapsed;
}

EVisibility SKBVEInfoPanel::HintVisibility() const
{
	return HasContent.Get(false) ? EVisibility::Collapsed : EVisibility::Visible;
}

int32 SKBVEInfoPanel::OnPaint(
	const FPaintArgs& Args,
	const FGeometry& AllottedGeometry,
	const FSlateRect& MyCullingRect,
	FSlateWindowElementList& OutDrawElements,
	int32 LayerId,
	const FWidgetStyle& InWidgetStyle,
	bool bParentEnabled) const
{
	const int32 BaseLayer = SCompoundWidget::OnPaint(
		Args, AllottedGeometry, MyCullingRect, OutDrawElements, LayerId, InWidgetStyle, bParentEnabled);

	if (!HasContent.Get(false) || !OnPaintIcon.IsBound())
	{
		return BaseLayer;
	}

	OnPaintIcon.Execute(AllottedGeometry, OutDrawElements, BaseLayer + 1, FVector2D(IconSize, IconSize));
	return BaseLayer + 2;
}
