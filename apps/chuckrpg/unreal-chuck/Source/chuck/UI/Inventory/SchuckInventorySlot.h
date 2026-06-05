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
		SLATE_ARGUMENT(FString, KeyLabel)
		SLATE_ARGUMENT(FLinearColor, BgFilledOverride)
		SLATE_ARGUMENT(FLinearColor, BgEmptyOverride)
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
	FString KeyLabel;
	FLinearColor BgFilledOverride = FLinearColor(0.f, 0.f, 0.f, 0.f);
	FLinearColor BgEmptyOverride  = FLinearColor(0.f, 0.f, 0.f, 0.f);
	bool  bHasBgOverride = false;
	TSharedPtr<int32> SelectedKey;
};
