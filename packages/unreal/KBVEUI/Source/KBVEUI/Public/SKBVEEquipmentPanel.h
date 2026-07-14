#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

enum class EKBVEEquipSlot : uint8
{
	Head      = 0,
	Chest     = 1,
	Legs      = 2,
	Feet      = 3,
	Hands     = 4,
	MainHand  = 5,
	OffHand   = 6,
	Back      = 7,
	Neck      = 8,
	Ring      = 9,
	Ammo      = 10,
	COUNT     = 11
};

class KBVEUI_API SKBVEEquipmentPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEEquipmentPanel) {}
		SLATE_ARGUMENT(TSharedPtr<int32>, SelectedKey)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	TSharedPtr<int32> SelectedKey;
};
