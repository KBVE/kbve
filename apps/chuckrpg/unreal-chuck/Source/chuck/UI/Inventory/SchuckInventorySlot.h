#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

class AchuckCoreCharacter;

class SchuckInventorySlot : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckInventorySlot)
		: _SlotIndex(0)
		, _SlotSize(64.f)
		, _bIsHotbar(false)
	{}
		SLATE_ARGUMENT(TWeakObjectPtr<AchuckCoreCharacter>, OwningCharacter)
		SLATE_ARGUMENT(int32, SlotIndex)
		SLATE_ARGUMENT(float, SlotSize)
		SLATE_ARGUMENT(bool, bIsHotbar)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

protected:
	virtual int32 OnPaint(
		const FPaintArgs& Args,
		const FGeometry& AllottedGeometry,
		const FSlateRect& MyCullingRect,
		FSlateWindowElementList& OutDrawElements,
		int32 LayerId,
		const FWidgetStyle& InWidgetStyle,
		bool bParentEnabled) const override;

	virtual FVector2D ComputeDesiredSize(float) const override;

private:
	TWeakObjectPtr<AchuckCoreCharacter> Character;
	int32 SlotIndex = 0;
	float SlotSize = 64.f;
	bool  bIsHotbar = false;
};
