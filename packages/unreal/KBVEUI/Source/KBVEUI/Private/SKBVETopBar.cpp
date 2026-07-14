#include "SKBVETopBar.h"

#include "KBVEUITheme.h"
#include "Styling/CoreStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Layout/SBox.h"

void SKBVETopBar::Construct(const FArguments& InArgs)
{
	SetCanTick(false);
	const FSlateBrush* WhiteBrush = FCoreStyle::Get().GetBrush("WhiteBrush");
	const FSlateColor BgColor = InArgs._BackgroundColor.Get(FSlateColor(KBVEUI::Theme::Color::PanelDeep.CopyWithNewOpacity(0.95f)));

	ChildSlot
	[
		SNew(SBox)
		.HeightOverride(InArgs._BarHeight)
		[
			SNew(SOverlay)

			+ SOverlay::Slot()
			[
				SNew(SImage)
				.Image(WhiteBrush)
				.ColorAndOpacity(BgColor)
			]

			+ SOverlay::Slot()
			.Padding(FMargin(12.f, 0.f))
			[
				SNew(SHorizontalBox)

				+ SHorizontalBox::Slot()
				.AutoWidth()
				.VAlign(VAlign_Center)
				[
					InArgs._Left.Widget
				]

				+ SHorizontalBox::Slot()
				.FillWidth(1.f)
				.HAlign(HAlign_Center)
				.VAlign(VAlign_Center)
				[
					InArgs._Center.Widget
				]

				+ SHorizontalBox::Slot()
				.AutoWidth()
				.VAlign(VAlign_Center)
				[
					InArgs._Right.Widget
				]
			]
		]
	];
}
