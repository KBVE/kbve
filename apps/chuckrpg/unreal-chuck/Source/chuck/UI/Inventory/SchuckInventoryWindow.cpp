#include "SchuckInventoryWindow.h"

#include "ChuckUIStyle.h"
#include "SchuckInventorySlot.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SGridPanel.h"
#include "Widgets/Layout/SScaleBox.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"

#define LOCTEXT_NAMESPACE "SchuckInventoryWindow"

void SchuckInventoryWindow::Construct(const FArguments& InArgs)
{
	Character = InArgs._OwningCharacter;

	const ISlateStyle& Style = FChuckUIStyle::Get();

	constexpr int32 Cols = 4;
	constexpr int32 Rows = 6;
	constexpr float SlotSize = 72.f;
	constexpr float SlotPad  = 6.f;
	constexpr float PanelPad = 24.f;

	TSharedRef<SGridPanel> Grid = SNew(SGridPanel);
	for (int32 R = 0; R < Rows; ++R)
	{
		for (int32 C = 0; C < Cols; ++C)
		{
			const int32 Idx = R * Cols + C;
			Grid->AddSlot(C, R)
			.Padding(SlotPad)
			[
				SNew(SchuckInventorySlot)
				.OwningCharacter(Character)
				.SlotIndex(Idx)
				.SlotSize(SlotSize)
				.bIsHotbar(false)
			];
		}
	}

	const FSlateFontInfo TitleFont = FCoreStyle::GetDefaultFontStyle("Bold", 22);

	ChildSlot
	[
		SNew(SOverlay)

		+ SOverlay::Slot()
		[
			SNew(SImage)
			.Image(FCoreStyle::Get().GetBrush("WhiteBrush"))
			.ColorAndOpacity(FLinearColor(0.f, 0.f, 0.f, 0.45f))
		]

		+ SOverlay::Slot()
		.HAlign(HAlign_Center)
		.VAlign(VAlign_Center)
		[
			SNew(SBox)
			.WidthOverride(Cols * (SlotSize + SlotPad * 2.f) + PanelPad * 2.f)
			[
				SNew(SVerticalBox)

				+ SVerticalBox::Slot()
				.AutoHeight()
				.Padding(0.f, 0.f, 0.f, 12.f)
				[
					SNew(STextBlock)
					.Text(LOCTEXT("Title", "Inventory"))
					.Font(TitleFont)
					.ColorAndOpacity(FLinearColor::White)
				]

				+ SVerticalBox::Slot()
				.AutoHeight()
				[
					SNew(SOverlay)

					+ SOverlay::Slot()
					[
						SNew(SImage)
						.Image(FCoreStyle::Get().GetBrush("WhiteBrush"))
						.ColorAndOpacity(FLinearColor(0.05f, 0.05f, 0.07f, 0.92f))
					]

					+ SOverlay::Slot()
					.Padding(PanelPad)
					[
						Grid
					]
				]
			]
		]
	];
}

#undef LOCTEXT_NAMESPACE
