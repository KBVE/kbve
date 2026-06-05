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

	constexpr float BaseSlotSize    = 56.f;
	constexpr float ExpandedScale   = 1.40f;
	constexpr float CollapsedScale  = 1.0f;
}

void SchuckHotbar::Construct(const FArguments& InArgs)
{
	Character    = InArgs._OwningCharacter;
	bExpanded    = false;
	CurrentScale = CollapsedScale;
	TargetScale  = CollapsedScale;

	SetVisibility(EVisibility::SelfHitTestInvisible);
	Build();
	SetCanTick(true);
}

void SchuckHotbar::SetExpanded(bool bInExpanded)
{
	if (bExpanded == bInExpanded) return;
	bExpanded   = bInExpanded;
	TargetScale = bExpanded ? ExpandedScale : CollapsedScale;
}

void SchuckHotbar::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);

	if (FMath::IsNearlyEqual(CurrentScale, TargetScale, 0.0005f))
	{
		CurrentScale = TargetScale;
		return;
	}
	const float Speed = 8.f;
	const float A     = FMath::Clamp(InDeltaTime * Speed, 0.f, 1.f);
	const float Smooth = A * A * (3.f - 2.f * A);
	CurrentScale = FMath::Lerp(CurrentScale, TargetScale, Smooth);
}

void SchuckHotbar::Build()
{
	const FLinearColor BgFilled(0.22f, 0.24f, 0.30f, 0.92f);
	const FLinearColor BgEmpty (0.18f, 0.21f, 0.27f, 0.55f);

	TWeakPtr<SchuckHotbar> WeakSelf = SharedThis(this);
	TAttribute<float> SizeAttr = TAttribute<float>::CreateLambda([WeakSelf]()
	{
		if (TSharedPtr<SchuckHotbar> Self = WeakSelf.Pin())
		{
			return BaseSlotSize * Self->CurrentScale;
		}
		return BaseSlotSize;
	});

	ChildSlot
	[
		SNew(SKBVEHotbar)
		.SlotCount(12)
		.SlotSize(BaseSlotSize * ExpandedScale)
		.SlotGap(1.f)
		.BottomPadding(24.f)
		.OnBuildSlot_Lambda([this, SizeAttr, BgFilled, BgEmpty, WeakSelf](int32 Idx) -> TSharedRef<SWidget>
		{
			TAttribute<FString> KeyAttr = TAttribute<FString>::CreateLambda([WeakSelf, Idx]() -> FString
			{
				TSharedPtr<SchuckHotbar> Self = WeakSelf.Pin();
				if (!Self.IsValid() || !Self->bExpanded) return FString();
				return FString(HotbarKeyLabel(Idx));
			});

			return SNew(SchuckInventorySlot)
				.OwningCharacter(Character)
				.SlotIndex(Idx)
				.SlotSize(SizeAttr)
				.bIsHotbar(true)
				.KeyLabelAttr(KeyAttr)
				.BgFilledOverride(BgFilled)
				.BgEmptyOverride(BgEmpty);
		})
	];
}
