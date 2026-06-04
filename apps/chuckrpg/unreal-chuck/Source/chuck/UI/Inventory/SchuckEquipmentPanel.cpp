#include "SchuckEquipmentPanel.h"

#include "Widgets/SBoxPanel.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SGridPanel.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"
#include "SKBVESlotWidget.h"

namespace
{
	FLinearColor SlotTint(EchuckEquipSlot Slot)
	{
		switch (Slot)
		{
			case EchuckEquipSlot::Head:     return FLinearColor(0.55f, 0.70f, 0.95f, 1.f);
			case EchuckEquipSlot::Chest:    return FLinearColor(0.95f, 0.55f, 0.55f, 1.f);
			case EchuckEquipSlot::Legs:     return FLinearColor(0.65f, 0.65f, 0.95f, 1.f);
			case EchuckEquipSlot::Feet:     return FLinearColor(0.55f, 0.95f, 0.65f, 1.f);
			case EchuckEquipSlot::Hands:    return FLinearColor(0.95f, 0.85f, 0.55f, 1.f);
			case EchuckEquipSlot::MainHand: return FLinearColor(0.95f, 0.45f, 0.20f, 1.f);
			case EchuckEquipSlot::OffHand:  return FLinearColor(0.85f, 0.45f, 0.95f, 1.f);
			case EchuckEquipSlot::Back:     return FLinearColor(0.55f, 0.85f, 0.95f, 1.f);
			case EchuckEquipSlot::Neck:     return FLinearColor(0.95f, 0.95f, 0.55f, 1.f);
			case EchuckEquipSlot::Ring:     return FLinearColor(0.85f, 0.85f, 0.95f, 1.f);
			case EchuckEquipSlot::Ammo:     return FLinearColor(0.55f, 0.95f, 0.95f, 1.f);
			default:                        return FLinearColor::White;
		}
	}

	const TCHAR* SlotLabel(EchuckEquipSlot Slot)
	{
		switch (Slot)
		{
			case EchuckEquipSlot::Head:     return TEXT("Head");
			case EchuckEquipSlot::Chest:    return TEXT("Chest");
			case EchuckEquipSlot::Legs:     return TEXT("Legs");
			case EchuckEquipSlot::Feet:     return TEXT("Feet");
			case EchuckEquipSlot::Hands:    return TEXT("Hands");
			case EchuckEquipSlot::MainHand: return TEXT("Main");
			case EchuckEquipSlot::OffHand:  return TEXT("Off");
			case EchuckEquipSlot::Back:     return TEXT("Back");
			case EchuckEquipSlot::Neck:     return TEXT("Neck");
			case EchuckEquipSlot::Ring:     return TEXT("Ring");
			case EchuckEquipSlot::Ammo:     return TEXT("Ammo");
			default:                        return TEXT("?");
		}
	}

	// 2-column paper-doll arrangement: head spans top, then body parts mirror.
	struct FLayoutCell { EchuckEquipSlot Slot; int32 Col; int32 Row; };
	static const FLayoutCell Cells[] = {
		{ EchuckEquipSlot::Head,     1, 0 },
		{ EchuckEquipSlot::Neck,     2, 0 },
		{ EchuckEquipSlot::Back,     0, 1 },
		{ EchuckEquipSlot::Chest,    1, 1 },
		{ EchuckEquipSlot::Hands,    2, 1 },
		{ EchuckEquipSlot::MainHand, 0, 2 },
		{ EchuckEquipSlot::Legs,     1, 2 },
		{ EchuckEquipSlot::OffHand,  2, 2 },
		{ EchuckEquipSlot::Ring,     0, 3 },
		{ EchuckEquipSlot::Feet,     1, 3 },
		{ EchuckEquipSlot::Ammo,     2, 3 }
	};
}

void SchuckEquipmentPanel::Construct(const FArguments& InArgs)
{
	Character   = InArgs._OwningCharacter;
	SelectedKey = InArgs._SelectedKey;

	const FSlateFontInfo LabelFont = FCoreStyle::GetDefaultFontStyle("Regular", 9);

	TSharedRef<SGridPanel> Grid = SNew(SGridPanel);

	for (const FLayoutCell& Cell : Cells)
	{
		const EchuckEquipSlot SlotEnum = Cell.Slot;
		const FLinearColor Tint = SlotTint(SlotEnum);

		Grid->AddSlot(Cell.Col, Cell.Row)
		.Padding(4.f)
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot()
			.AutoHeight()
			.HAlign(HAlign_Center)
			[
				SNew(SKBVESlotWidget)
				.SlotSize(64.f)
				.OnIsFilled(FOnKBVESlotIsFilled::CreateLambda([]() { return false; }))
				.OnGetBorderColor(FOnKBVESlotBorderColor::CreateLambda([Tint]() { return Tint; }))
			]
			+ SVerticalBox::Slot()
			.AutoHeight()
			.HAlign(HAlign_Center)
			.Padding(0.f, 2.f, 0.f, 0.f)
			[
				SNew(STextBlock)
				.Text(FText::FromString(SlotLabel(SlotEnum)))
				.Font(LabelFont)
				.ColorAndOpacity(FLinearColor(0.85f, 0.85f, 0.88f, 0.85f))
			]
		];
	}

	ChildSlot
	[
		SNew(SBox)
		.WidthOverride(260.f)
		.HAlign(HAlign_Center)
		[
			Grid
		]
	];
}
