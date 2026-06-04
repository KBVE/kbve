#include "SchuckHotbar.h"

#include "SchuckInventorySlot.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Layout/SBox.h"

void SchuckHotbar::Construct(const FArguments& InArgs)
{
	Character = InArgs._OwningCharacter;

	constexpr int32 SlotCount = 10;
	constexpr float SlotSize  = 56.f;
	constexpr float SlotGap   = 4.f;

	TSharedRef<SHorizontalBox> Row = SNew(SHorizontalBox);
	for (int32 i = 0; i < SlotCount; ++i)
	{
		Row->AddSlot()
		.AutoWidth()
		.Padding(SlotGap, 0.f, SlotGap, 0.f)
		[
			SNew(SchuckInventorySlot)
			.OwningCharacter(Character)
			.SlotIndex(i)
			.SlotSize(SlotSize)
			.bIsHotbar(true)
		];
	}

	ChildSlot
	[
		SNew(SOverlay)

		+ SOverlay::Slot()
		.HAlign(HAlign_Center)
		.VAlign(VAlign_Bottom)
		.Padding(0.f, 0.f, 0.f, 16.f)
		[
			Row
		]
	];
}
