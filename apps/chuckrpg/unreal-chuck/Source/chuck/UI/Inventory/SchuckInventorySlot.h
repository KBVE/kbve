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
		SLATE_ARGUMENT(TSharedPtr<int32>, SelectedKey)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	const struct FchuckInventoryStack* GetStack() const;
	const struct FchuckItemDef*        GetDef()   const;
	class UchuckItemDB*                GetDB()    const;

	bool         OnIsFilled() const;
	FLinearColor OnGetBorderColor() const;
	int32        OnGetCount() const;
	void         OnClicked();
	void         OnHover(bool bEntered, const FVector2D& ScreenPos);
	void         OnPaintIcon(const FGeometry& Geom, FSlateWindowElementList& Out, int32 Layer, const FVector2D& SlotSize);
	TSharedPtr<SWidget> BuildDragDecorator();

	TWeakObjectPtr<AchuckCoreCharacter> Character;
	int32 SlotIndex = 0;
	float SlotSize = 64.f;
	bool  bIsHotbar = false;
	TSharedPtr<int32> SelectedKey;
};
