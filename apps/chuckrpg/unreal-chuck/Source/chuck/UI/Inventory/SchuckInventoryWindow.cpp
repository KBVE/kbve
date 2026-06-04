#include "SchuckInventoryWindow.h"

#include "ChuckUIStyle.h"
#include "SchuckInventorySlot.h"
#include "SchuckItemInfo.h"
#include "SKBVEMovableFrame.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SGridPanel.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"

#define LOCTEXT_NAMESPACE "SchuckInventoryWindow"

void SchuckInventoryWindow::Construct(const FArguments& InArgs)
{
	Character = InArgs._OwningCharacter;
	OnClose   = InArgs._OnCloseClicked;

	SelectedKey = MakeShared<int32>(0);

	constexpr int32 Cols     = 4;
	constexpr int32 Rows     = 6;
	constexpr float SlotSize = 72.f;
	constexpr float SlotPad  = 6.f;

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
				.SelectedKey(SelectedKey)
			];
		}
	}

	const float BagWidth  = Cols * (SlotSize + SlotPad * 2.f) + 24.f;
	const float InfoWidth = 360.f;
	const float ContentHeight = Rows * (SlotSize + SlotPad * 2.f) + 16.f;

	const float FrameW = BagWidth + InfoWidth + 24.f;
	const float FrameH = ContentHeight + 64.f;

	ChildSlot
	[
		SNew(SKBVEMovableFrame)
		.Title(LOCTEXT("Title", "Inventory"))
		.InitialPosition(FVector2D(160.f, 140.f))
		.FrameSize(FVector2D(FrameW, FrameH))
		.OnCloseClicked(OnClose)
		.Body()
		[
			SNew(SHorizontalBox)

			+ SHorizontalBox::Slot()
			.AutoWidth()
			[
				SNew(SBox)
				.WidthOverride(BagWidth)
				[
					Grid
				]
			]

			+ SHorizontalBox::Slot()
			.FillWidth(1.f)
			.Padding(FMargin(12.f, 0.f, 0.f, 0.f))
			[
				SNew(SchuckItemInfo)
				.OwningCharacter(Character)
				.SelectedKey(SelectedKey)
			]
		]
	];
}

#undef LOCTEXT_NAMESPACE
