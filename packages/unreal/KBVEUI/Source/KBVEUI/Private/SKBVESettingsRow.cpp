#include "SKBVESettingsRow.h"

#include "Styling/CoreStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Text/STextBlock.h"

void SKBVESettingsRow::Construct(const FArguments& InArgs)
{
	const FSlateFontInfo LabelFont = FCoreStyle::GetDefaultFontStyle("Regular", 12);
	const FSlateFontInfo HintFont  = FCoreStyle::GetDefaultFontStyle("Italic", 10);

	ChildSlot
	[
		SNew(SHorizontalBox)

		+ SHorizontalBox::Slot()
		.AutoWidth()
		.VAlign(VAlign_Center)
		[
			SNew(SBox)
			.WidthOverride(InArgs._LabelWidth)
			[
				SNew(SVerticalBox)

				+ SVerticalBox::Slot()
				.AutoHeight()
				[
					SNew(STextBlock)
					.Text(InArgs._Label)
					.Font(LabelFont)
					.ColorAndOpacity(InArgs._LabelColor)
					.AutoWrapText(true)
				]

				+ SVerticalBox::Slot()
				.AutoHeight()
				.Padding(0.f, 2.f, 0.f, 0.f)
				[
					SNew(STextBlock)
					.Text(InArgs._Hint)
					.Font(HintFont)
					.ColorAndOpacity(FLinearColor(0.6f, 0.6f, 0.65f, 0.9f))
					.AutoWrapText(true)
					.Visibility(EVisibility::SelfHitTestInvisible)
				]
			]
		]

		+ SHorizontalBox::Slot()
		.FillWidth(1.f)
		.VAlign(VAlign_Center)
		.Padding(12.f, 0.f, 0.f, 0.f)
		[
			InArgs._Content.Widget
		]
	];
}
