#include "SchuckInventorySlot.h"

#include "ChuckUIStyle.h"
#include "chuckCoreCharacter.h"
#include "chuckHUDRenderer.h"
#include "chuckInventory.h"
#include "chuckItemDB.h"
#include "chuckItemTypes.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Styling/CoreStyle.h"

void SchuckInventorySlot::Construct(const FArguments& InArgs)
{
	Character  = InArgs._OwningCharacter;
	SlotIndex  = InArgs._SlotIndex;
	SlotSize   = InArgs._SlotSize;
	bIsHotbar  = InArgs._bIsHotbar;

	SetCanTick(false);
}

FVector2D SchuckInventorySlot::ComputeDesiredSize(float) const
{
	return FVector2D(SlotSize, SlotSize);
}

int32 SchuckInventorySlot::OnPaint(
	const FPaintArgs& Args,
	const FGeometry& AllottedGeometry,
	const FSlateRect& MyCullingRect,
	FSlateWindowElementList& OutDrawElements,
	int32 LayerId,
	const FWidgetStyle& InWidgetStyle,
	bool bParentEnabled) const
{
	const FVector2D Size = AllottedGeometry.GetLocalSize();

	const FLinearColor BgEmpty(0.05f, 0.05f, 0.06f, 0.78f);
	const FLinearColor BgFilled(0.10f, 0.10f, 0.12f, 0.92f);

	const FchuckInventoryStack* Stack = nullptr;
	const FchuckItemDef* Def = nullptr;

	AchuckCoreCharacter* C = Character.Get();
	if (C)
	{
		const FchuckInventory& Inv = C->GetInventory();
		const TArray<FchuckInventoryStack>& Slots = bIsHotbar ? Inv.Hotbar.Slots : Inv.DefaultBag.Slots;
		if (Slots.IsValidIndex(SlotIndex))
		{
			Stack = &Slots[SlotIndex];
			if (!Stack->IsEmpty())
			{
				if (UGameInstance* GI = C->GetGameInstance())
				{
					if (UchuckItemDB* DB = GI->GetSubsystem<UchuckItemDB>())
					{
						Def = DB->LookupByKey(Stack->ItemKey);
					}
				}
			}
		}
	}

	const bool bFilled = Stack && !Stack->IsEmpty() && Def;
	const FLinearColor Border = bFilled
		? chuckItem::RarityColor(Def->Rarity)
		: FLinearColor(0.25f, 0.25f, 0.28f, 1.f);

	const FSlateBrush* WhiteBrush = FCoreStyle::Get().GetBrush("WhiteBrush");

	FSlateDrawElement::MakeBox(
		OutDrawElements, LayerId,
		AllottedGeometry.ToPaintGeometry(),
		WhiteBrush, ESlateDrawEffect::None, Border);

	const FVector2D Inset(2.f, 2.f);
	FSlateDrawElement::MakeBox(
		OutDrawElements, LayerId + 1,
		AllottedGeometry.ToPaintGeometry(Size - Inset * 2.f, FSlateLayoutTransform(Inset)),
		WhiteBrush, ESlateDrawEffect::None,
		bFilled ? BgFilled : BgEmpty);

	if (bFilled)
	{
		const FSlateFontInfo IconFont = FCoreStyle::GetDefaultFontStyle("Bold", 22);
		const FSlateFontInfo CountFont = FCoreStyle::GetDefaultFontStyle("Bold", 12);

		if (!Def->Emoji.IsEmpty())
		{
			chuckHUDRenderer::DrawText(
				OutDrawElements, AllottedGeometry, LayerId + 2,
				FVector2D(Size.X * 0.5f - 12.f, Size.Y * 0.5f - 16.f),
				Def->Emoji, IconFont, FLinearColor::White);
		}
		else
		{
			const FSlateFontInfo RefFont = FCoreStyle::GetDefaultFontStyle("Regular", 9);
			chuckHUDRenderer::DrawText(
				OutDrawElements, AllottedGeometry, LayerId + 2,
				FVector2D(4.f, Size.Y * 0.5f - 6.f),
				Def->Ref.ToString().Left(8),
				RefFont, FLinearColor(0.9f, 0.9f, 0.9f, 1.f));
		}

		if (Stack->Count > 1)
		{
			const FString CountText = FString::Printf(TEXT("%d"), Stack->Count);
			chuckHUDRenderer::DrawText(
				OutDrawElements, AllottedGeometry, LayerId + 3,
				FVector2D(Size.X - 18.f, Size.Y - 14.f),
				CountText, CountFont, FLinearColor::White);
		}
	}

	return LayerId + 4;
}
