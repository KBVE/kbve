#include "SchuckHotbar.h"

#include "SchuckInventorySlot.h"
#include "SKBVEHotbar.h"

void SchuckHotbar::Construct(const FArguments& InArgs)
{
	Character = InArgs._OwningCharacter;

	ChildSlot
	[
		SNew(SKBVEHotbar)
		.SlotCount(10)
		.SlotSize(56.f)
		.SlotGap(4.f)
		.BottomPadding(16.f)
		.OnBuildSlot_Lambda([this](int32 Idx) -> TSharedRef<SWidget>
		{
			return SNew(SchuckInventorySlot)
				.OwningCharacter(Character)
				.SlotIndex(Idx)
				.SlotSize(56.f)
				.bIsHotbar(true);
		})
	];
}
