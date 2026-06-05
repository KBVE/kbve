#include "SchuckHotbar.h"

#include "SchuckInventorySlot.h"
#include "SKBVEHotbar.h"

namespace
{
	const TCHAR* HotbarKeyLabel(int32 Idx)
	{
		static const TCHAR* Labels[] = {
			TEXT("1"), TEXT("2"), TEXT("3"), TEXT("4"), TEXT("5"),
			TEXT("6"), TEXT("7"), TEXT("8"), TEXT("9"), TEXT("0"),
			TEXT("-"), TEXT("=")
		};
		return (Idx >= 0 && Idx < (int32)UE_ARRAY_COUNT(Labels)) ? Labels[Idx] : TEXT("");
	}
}

void SchuckHotbar::Construct(const FArguments& InArgs)
{
	Character    = InArgs._OwningCharacter;
	bExpanded    = false;
	CurrentScale = 1.f;
	TargetScale  = 1.f;

	SetVisibility(EVisibility::SelfHitTestInvisible);
	Build();
	SetCanTick(true);
}

void SchuckHotbar::SetExpanded(bool bInExpanded)
{
	if (bExpanded == bInExpanded) return;
	bExpanded = bInExpanded;
	Build();
}

void SchuckHotbar::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);
}

void SchuckHotbar::Build()
{
	const float SlotSize  = bExpanded ? 78.f : 56.f;
	const float SlotGap   = 1.f;
	const float BottomPad = bExpanded ? 28.f : 20.f;
	const bool  bShowKeys = bExpanded;

	const FLinearColor BgFilled(0.22f, 0.24f, 0.30f, 0.92f);
	const FLinearColor BgEmpty (0.18f, 0.21f, 0.27f, 0.55f);

	ChildSlot
	[
		SNew(SKBVEHotbar)
		.SlotCount(12)
		.SlotSize(SlotSize)
		.SlotGap(SlotGap)
		.BottomPadding(BottomPad)
		.OnBuildSlot_Lambda([this, SlotSize, bShowKeys, BgFilled, BgEmpty](int32 Idx) -> TSharedRef<SWidget>
		{
			return SNew(SchuckInventorySlot)
				.OwningCharacter(Character)
				.SlotIndex(Idx)
				.SlotSize(SlotSize)
				.bIsHotbar(true)
				.KeyLabel(bShowKeys ? FString(HotbarKeyLabel(Idx)) : FString())
				.BgFilledOverride(BgFilled)
				.BgEmptyOverride(BgEmpty);
		})
	];
	Invalidate(EInvalidateWidgetReason::Layout);
}
