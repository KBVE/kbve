#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

class AchuckCoreCharacter;

UENUM()
enum class EchuckEquipSlot : uint8
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

class SchuckEquipmentPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckEquipmentPanel) {}
		SLATE_ARGUMENT(TWeakObjectPtr<AchuckCoreCharacter>, OwningCharacter)
		SLATE_ARGUMENT(TSharedPtr<int32>, SelectedKey)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	TWeakObjectPtr<AchuckCoreCharacter> Character;
	TSharedPtr<int32> SelectedKey;
};
