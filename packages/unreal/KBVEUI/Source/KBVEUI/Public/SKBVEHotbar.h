#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

DECLARE_DELEGATE_RetVal_OneParam(TSharedRef<SWidget>, FOnKBVEHotbarBuildSlot, int32 /*SlotIndex*/);

// Bottom-centered hotbar shell. Caller supplies per-slot widget via
// FOnKBVEHotbarBuildSlot(SlotIndex) -- typically returns an SKBVESlotWidget
// configured with the caller's game-specific delegates. Layout, padding,
// anchoring are owned by the plugin.
class KBVEUI_API SKBVEHotbar : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEHotbar)
		: _SlotCount(10)
		, _SlotSize(56.f)
		, _SlotGap(4.f)
		, _BottomPadding(16.f)
	{}
		SLATE_ARGUMENT(int32, SlotCount)
		SLATE_ARGUMENT(float, SlotSize)
		SLATE_ARGUMENT(float, SlotGap)
		SLATE_ARGUMENT(float, BottomPadding)
		SLATE_EVENT(FOnKBVEHotbarBuildSlot, OnBuildSlot)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
};
