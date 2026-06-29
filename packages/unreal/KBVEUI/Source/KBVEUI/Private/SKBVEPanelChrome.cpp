#include "SKBVEPanelChrome.h"

#include "KBVEUIStyle.h"
#include "KBVEUITheme.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Text/STextBlock.h"

void SKBVEPanelChrome::Construct(const FArguments& InArgs)
{
	using namespace KBVEUI::Theme;

	const FName BgName = InArgs._bDeep ? FName("KBVE.Brush.PanelDeep") : InArgs._BackgroundName;

	TSharedRef<SVerticalBox> Body = SNew(SVerticalBox);

	if (InArgs._Title.IsSet() || InArgs._Title.IsBound())
	{
		Body->AddSlot()
		.AutoHeight()
		.Padding(FMargin(InArgs._ContentPadding.Left, InArgs._ContentPadding.Top, InArgs._ContentPadding.Right, Metric::PaddingTight))
		[
			SNew(STextBlock)
			.Text(InArgs._Title)
			.TextStyle(&FKBVEUIStyle::GetTextStyle("KBVE.Text.Header"))
		];
	}

	Body->AddSlot()
	.FillHeight(1.f)
	.Padding(InArgs._ContentPadding)
	[
		InArgs._Content.Widget
	];

	ChildSlot
	[
		SNew(SBorder)
		.BorderImage(FKBVEUIStyle::GetBrush("KBVE.Brush.Border"))
		.BorderBackgroundColor(Color::PanelBorder)
		.Padding(Metric::BorderWidth)
		[
			SNew(SOverlay)

			+ SOverlay::Slot()
			[
				SNew(SImage)
				.Image(FKBVEUIStyle::GetBrush(BgName))
			]

			+ SOverlay::Slot()
			[
				Body
			]
		]
	];
}
