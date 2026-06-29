#include "SKBVEEquipmentPanel.h"

#include "Widgets/SBoxPanel.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SGridPanel.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"
#include "SKBVESlotWidget.h"
#include "KBVEUITheme.h"

namespace
{
	FLinearColor SlotTint(EKBVEEquipSlot Slot)
	{
		switch (Slot)
		{
			case EKBVEEquipSlot::Head:     return FLinearColor(0.55f, 0.70f, 0.95f, 1.f);
			case EKBVEEquipSlot::Chest:    return FLinearColor(0.95f, 0.55f, 0.55f, 1.f);
			case EKBVEEquipSlot::Legs:     return FLinearColor(0.65f, 0.65f, 0.95f, 1.f);
			case EKBVEEquipSlot::Feet:     return FLinearColor(0.55f, 0.95f, 0.65f, 1.f);
			case EKBVEEquipSlot::Hands:    return FLinearColor(0.95f, 0.85f, 0.55f, 1.f);
			case EKBVEEquipSlot::MainHand: return FLinearColor(0.95f, 0.45f, 0.20f, 1.f);
			case EKBVEEquipSlot::OffHand:  return KBVEUI::Theme::Color::Highlight;
			case EKBVEEquipSlot::Back:     return FLinearColor(0.55f, 0.85f, 0.95f, 1.f);
			case EKBVEEquipSlot::Neck:     return FLinearColor(0.95f, 0.95f, 0.55f, 1.f);
			case EKBVEEquipSlot::Ring:     return FLinearColor(0.85f, 0.85f, 0.95f, 1.f);
			case EKBVEEquipSlot::Ammo:     return FLinearColor(0.55f, 0.95f, 0.95f, 1.f);
			default:                       return FLinearColor::White;
		}
	}

	const TCHAR* SlotLabel(EKBVEEquipSlot Slot)
	{
		switch (Slot)
		{
			case EKBVEEquipSlot::Head:     return TEXT("Head");
			case EKBVEEquipSlot::Chest:    return TEXT("Chest");
			case EKBVEEquipSlot::Legs:     return TEXT("Legs");
			case EKBVEEquipSlot::Feet:     return TEXT("Feet");
			case EKBVEEquipSlot::Hands:    return TEXT("Hands");
			case EKBVEEquipSlot::MainHand: return TEXT("Main");
			case EKBVEEquipSlot::OffHand:  return TEXT("Off");
			case EKBVEEquipSlot::Back:     return TEXT("Back");
			case EKBVEEquipSlot::Neck:     return TEXT("Neck");
			case EKBVEEquipSlot::Ring:     return TEXT("Ring");
			case EKBVEEquipSlot::Ammo:     return TEXT("Ammo");
			default:                       return TEXT("?");
		}
	}

	struct FLayoutCell { EKBVEEquipSlot Slot; int32 Col; int32 Row; };
	static const FLayoutCell Cells[] = {
		{ EKBVEEquipSlot::Head,     1, 0 },
		{ EKBVEEquipSlot::Neck,     2, 0 },
		{ EKBVEEquipSlot::Back,     0, 1 },
		{ EKBVEEquipSlot::Chest,    1, 1 },
		{ EKBVEEquipSlot::Hands,    2, 1 },
		{ EKBVEEquipSlot::MainHand, 0, 2 },
		{ EKBVEEquipSlot::Legs,     1, 2 },
		{ EKBVEEquipSlot::OffHand,  2, 2 },
		{ EKBVEEquipSlot::Ring,     0, 3 },
		{ EKBVEEquipSlot::Feet,     1, 3 },
		{ EKBVEEquipSlot::Ammo,     2, 3 }
	};
}

void SKBVEEquipmentPanel::Construct(const FArguments& InArgs)
{
	SetCanTick(false);
	SelectedKey = InArgs._SelectedKey;

	const FSlateFontInfo LabelFont = FCoreStyle::GetDefaultFontStyle("Regular", 9);

	TSharedRef<SGridPanel> Grid = SNew(SGridPanel);

	for (const FLayoutCell& Cell : Cells)
	{
		const EKBVEEquipSlot SlotEnum = Cell.Slot;
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
				.ColorAndOpacity(KBVEUI::Theme::Color::TextPrimary.CopyWithNewOpacity(0.85f))
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
