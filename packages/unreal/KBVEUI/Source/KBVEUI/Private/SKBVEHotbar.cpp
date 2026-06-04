#include "SKBVEHotbar.h"

#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"

void SKBVEHotbar::Construct(const FArguments& InArgs)
{
	const int32 SlotCount = FMath::Max(1, InArgs._SlotCount);
	const float Gap = InArgs._SlotGap;
	const float Bottom = InArgs._BottomPadding;

	TSharedRef<SHorizontalBox> Row = SNew(SHorizontalBox);
	for (int32 i = 0; i < SlotCount; ++i)
	{
		TSharedRef<SWidget> Slot = InArgs._OnBuildSlot.IsBound()
			? InArgs._OnBuildSlot.Execute(i)
			: SNew(SBox);

		Row->AddSlot()
		.AutoWidth()
		.Padding(Gap, 0.f, Gap, 0.f)
		[
			Slot
		];
	}

	ChildSlot
	[
		SNew(SOverlay)
		+ SOverlay::Slot()
		.HAlign(HAlign_Center)
		.VAlign(VAlign_Bottom)
		.Padding(0.f, 0.f, 0.f, Bottom)
		[
			Row
		]
	];
}
