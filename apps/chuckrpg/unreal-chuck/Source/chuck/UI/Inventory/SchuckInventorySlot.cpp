#include "SchuckInventorySlot.h"

#include "chuckCoreCharacter.h"
#include "chuckEventPayloads.h"
#include "chuckInventory.h"
#include "chuckItemDB.h"
#include "chuckItemTypes.h"
#include "chuckUIEvents.h"
#include "Engine/GameInstance.h"
#include "Rendering/DrawElements.h"
#include "SKBVESlotWidget.h"

void SchuckInventorySlot::Construct(const FArguments& InArgs)
{
	Character    = InArgs._OwningCharacter;
	SlotIndex    = InArgs._SlotIndex;
	SlotSize     = InArgs._SlotSize;
	bIsHotbar    = InArgs._bIsHotbar;
	SelectedKey  = InArgs._SelectedKey;

	ChildSlot
	[
		SNew(SKBVESlotWidget)
		.SlotSize(SlotSize)
		.OnIsFilled(FOnKBVESlotIsFilled::CreateSP(this, &SchuckInventorySlot::OnIsFilled))
		.OnGetBorderColor(FOnKBVESlotBorderColor::CreateSP(this, &SchuckInventorySlot::OnGetBorderColor))
		.OnGetCount(FOnKBVESlotCount::CreateSP(this, &SchuckInventorySlot::OnGetCount))
		.OnPaintIcon(FOnKBVESlotPaintIcon::CreateSP(this, &SchuckInventorySlot::OnPaintIcon))
		.OnClicked(FOnKBVESlotClicked::CreateSP(this, &SchuckInventorySlot::OnClicked))
		.OnHover(FOnKBVESlotHover::CreateSP(this, &SchuckInventorySlot::OnHover))
		.DragDomain(bIsHotbar ? FName(TEXT("chuck.hotbar")) : FName(TEXT("chuck.bag")))
		.SlotIndex(SlotIndex)
		.OnGetPayloadKey(FOnKBVESlotPayloadKey::CreateLambda([this]() -> int32
		{
			const FchuckInventoryStack* S = GetStack();
			return S ? S->ItemKey : 0;
		}))
		.OnDropped(FOnKBVESlotDropped::CreateLambda([this](int32 SourceIndex)
		{
			if (AchuckCoreCharacter* C = Character.Get())
			{
				C->SwapBagSlots(SourceIndex, SlotIndex, bIsHotbar);
			}
		}))
	];
}

void SchuckInventorySlot::OnHover(bool bEntered, const FVector2D& ScreenPos)
{
	AchuckCoreCharacter* C = Character.Get();
	if (!C) return;
	UchuckUIEvents* Bus = UchuckUIEvents::Get(C);
	if (!Bus) return;

	FchuckTooltipPayload P;
	P.bShow = bEntered;
	P.ScreenPos = ScreenPos;

	if (bEntered)
	{
		const FchuckItemDef* Def = GetDef();
		if (Def)
		{
			P.Text = FText::FromString(Def->Name);
		}
		else
		{
			P.bShow = false;
		}
	}
	Bus->Tooltip.Publish(P);
}

const FchuckInventoryStack* SchuckInventorySlot::GetStack() const
{
	AchuckCoreCharacter* C = Character.Get();
	if (!C) return nullptr;
	const FchuckInventory& Inv = C->GetInventory();
	const TArray<FchuckInventoryStack>& Slots = bIsHotbar ? Inv.Hotbar.Slots : Inv.DefaultBag.Slots;
	return Slots.IsValidIndex(SlotIndex) ? &Slots[SlotIndex] : nullptr;
}

UchuckItemDB* SchuckInventorySlot::GetDB() const
{
	AchuckCoreCharacter* C = Character.Get();
	if (!C) return nullptr;
	UGameInstance* GI = C->GetGameInstance();
	return GI ? GI->GetSubsystem<UchuckItemDB>() : nullptr;
}

const FchuckItemDef* SchuckInventorySlot::GetDef() const
{
	const FchuckInventoryStack* S = GetStack();
	if (!S || S->IsEmpty()) return nullptr;
	UchuckItemDB* DB = GetDB();
	return DB ? DB->LookupByKey(S->ItemKey) : nullptr;
}

bool SchuckInventorySlot::OnIsFilled() const
{
	const FchuckInventoryStack* S = GetStack();
	return S && !S->IsEmpty();
}

FLinearColor SchuckInventorySlot::OnGetBorderColor() const
{
	const FchuckItemDef* Def = GetDef();
	return Def ? chuckItem::RarityColor(Def->Rarity) : FLinearColor::White;
}

int32 SchuckInventorySlot::OnGetCount() const
{
	const FchuckInventoryStack* S = GetStack();
	return S ? S->Count : 0;
}

void SchuckInventorySlot::OnClicked()
{
	if (!SelectedKey.IsValid()) return;
	const FchuckInventoryStack* S = GetStack();
	*SelectedKey = (S && !S->IsEmpty()) ? S->ItemKey : 0;
}

void SchuckInventorySlot::OnPaintIcon(const FGeometry& Geom, FSlateWindowElementList& Out, int32 Layer, const FVector2D& InSlotSize)
{
	const FchuckItemDef* Def = GetDef();
	UchuckItemDB* DB = GetDB();
	if (!Def) return;

	const bool bDrawAtlas = DB && DB->HasAtlas() && DB->GetAtlasHandle().IsValid();
	if (bDrawAtlas)
	{
		FVector2D UVTL, UVBR;
		DB->GetIconUV(Def->Key, UVTL, UVBR);

		const float Pad = 6.f;
		const FVector2D P0(Pad,                Pad);
		const FVector2D P1(InSlotSize.X - Pad, Pad);
		const FVector2D P2(InSlotSize.X - Pad, InSlotSize.Y - Pad);
		const FVector2D P3(Pad,                InSlotSize.Y - Pad);

		auto AddV = [&](TArray<FSlateVertex>& V, const FVector2D& Local, const FVector2D& UV)
		{
			FSlateVertex Vx;
			Vx.Position = FVector2f(Geom.LocalToAbsolute(Local));
			Vx.Color = FColor::White;
			Vx.TexCoords[0] = UV.X; Vx.TexCoords[1] = UV.Y;
			Vx.TexCoords[2] = 1.f;  Vx.TexCoords[3] = 1.f;
			Vx.MaterialTexCoords = FVector2f::ZeroVector;
			V.Add(Vx);
		};

		TArray<FSlateVertex> Verts; Verts.Reserve(4);
		AddV(Verts, P0, UVTL);
		AddV(Verts, P1, FVector2D(UVBR.X, UVTL.Y));
		AddV(Verts, P2, UVBR);
		AddV(Verts, P3, FVector2D(UVTL.X, UVBR.Y));
		TArray<SlateIndex> Idx = { 0, 1, 2, 0, 2, 3 };

		FSlateDrawElement::MakeCustomVerts(Out, Layer, DB->GetAtlasHandle(), Verts, Idx, nullptr, 0, 0);
	}
}
