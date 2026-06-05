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
#include "Widgets/SLeafWidget.h"

namespace
{
	class SchuckDragIcon : public SLeafWidget
	{
	public:
		SLATE_BEGIN_ARGS(SchuckDragIcon)
			: _IconSize(64.f)
			, _Alpha(0.55f)
		{}
			SLATE_ARGUMENT(FSlateResourceHandle, AtlasHandle)
			SLATE_ARGUMENT(FVector2D, UVTL)
			SLATE_ARGUMENT(FVector2D, UVBR)
			SLATE_ARGUMENT(float, IconSize)
			SLATE_ARGUMENT(float, Alpha)
		SLATE_END_ARGS()

		void Construct(const FArguments& InArgs)
		{
			AtlasHandle = InArgs._AtlasHandle;
			UVTL        = InArgs._UVTL;
			UVBR        = InArgs._UVBR;
			IconSize    = InArgs._IconSize;
			Alpha       = InArgs._Alpha;
			SetCanTick(false);
		}

		virtual FVector2D ComputeDesiredSize(float) const override
		{
			return FVector2D(IconSize, IconSize);
		}

		virtual int32 OnPaint(
			const FPaintArgs&, const FGeometry& Geom, const FSlateRect&,
			FSlateWindowElementList& Out, int32 Layer,
			const FWidgetStyle&, bool) const override
		{
			if (!AtlasHandle.IsValid()) return Layer;

			const FVector2D Size = Geom.GetLocalSize();

			auto MakeQuad = [&](const FVector2D& Offset, float ScaleAdj, const FColor& Tint)
			{
				const float Pad = -ScaleAdj * 0.5f;
				const FVector2D P0(Pad,                  Pad);
				const FVector2D P1(Size.X - Pad,         Pad);
				const FVector2D P2(Size.X - Pad,         Size.Y - Pad);
				const FVector2D P3(Pad,                  Size.Y - Pad);

				TArray<FSlateVertex> Verts; Verts.Reserve(4);
				auto AddV = [&](const FVector2D& Local, const FVector2D& UV)
				{
					FSlateVertex Vx;
					Vx.Position = FVector2f(Geom.LocalToAbsolute(Local + Offset));
					Vx.Color = Tint;
					Vx.TexCoords[0] = UV.X; Vx.TexCoords[1] = UV.Y;
					Vx.TexCoords[2] = 1.f;  Vx.TexCoords[3] = 1.f;
					Vx.MaterialTexCoords = FVector2f::ZeroVector;
					Verts.Add(Vx);
				};
				AddV(P0, UVTL);
				AddV(P1, FVector2D(UVBR.X, UVTL.Y));
				AddV(P2, UVBR);
				AddV(P3, FVector2D(UVTL.X, UVBR.Y));
				return Verts;
			};
			TArray<SlateIndex> Idx = { 0, 1, 2, 0, 2, 3 };

			const FColor ShadowTint = FLinearColor(0.f, 0.f, 0.f, 0.40f).ToFColor(true);
			TArray<FSlateVertex> ShadowVerts = MakeQuad(FVector2D(4.f, 6.f), 6.f, ShadowTint);
			FSlateDrawElement::MakeCustomVerts(Out, Layer, AtlasHandle, ShadowVerts, Idx, nullptr, 0, 0);

			const FColor IconTint = FLinearColor(1.f, 1.f, 1.f, Alpha).ToFColor(true);
			TArray<FSlateVertex> IconVerts = MakeQuad(FVector2D::ZeroVector, 8.f, IconTint);
			FSlateDrawElement::MakeCustomVerts(Out, Layer + 1, AtlasHandle, IconVerts, Idx, nullptr, 0, 0);
			return Layer + 2;
		}

	private:
		FSlateResourceHandle AtlasHandle;
		FVector2D UVTL = FVector2D::ZeroVector;
		FVector2D UVBR = FVector2D(1.f, 1.f);
		float IconSize = 64.f;
		float Alpha = 0.55f;
	};
}

void SchuckInventorySlot::Construct(const FArguments& InArgs)
{
	Character    = InArgs._OwningCharacter;
	SlotIndex    = InArgs._SlotIndex;
	SlotSize     = InArgs._SlotSize;
	bIsHotbar    = InArgs._bIsHotbar;
	SelectedKey  = InArgs._SelectedKey;

	const FName OwnDomain = bIsHotbar ? FName(TEXT("chuck.hotbar")) : FName(TEXT("chuck.bag"));
	TArray<FName> Accepted;
	Accepted.Add(FName(TEXT("chuck.bag")));
	Accepted.Add(FName(TEXT("chuck.hotbar")));

	ChildSlot
	[
		SNew(SKBVESlotWidget)
		.SlotSize(SlotSize)
		.OnIsFilled(FOnKBVESlotIsFilled::CreateSP(this, &SchuckInventorySlot::OnIsFilled))
		.OnGetBorderColor(FOnKBVESlotBorderColor::CreateSP(this, &SchuckInventorySlot::OnGetBorderColor))
		.OnGetCount(FOnKBVESlotCount::CreateSP(this, &SchuckInventorySlot::OnGetCount))
		.OnPaintIcon(FOnKBVESlotPaintIcon::CreateSP(this, &SchuckInventorySlot::OnPaintIcon))
		.OnClicked(FOnKBVESlotClicked::CreateSP(this, &SchuckInventorySlot::OnClicked))
		.OnRightClicked(FOnKBVESlotRightClicked::CreateLambda([this]()
		{
			AchuckCoreCharacter* C = Character.Get();
			if (!C) return;
			const FchuckItemDef* Def = GetDef();
			if (!Def || !Def->bConsumable) return;
			C->ServerConsumeSlot(SlotIndex, bIsHotbar);
		}))
		.OnShiftRightClicked(FOnKBVESlotShiftRightClicked::CreateLambda([this]()
		{
			AchuckCoreCharacter* C = Character.Get();
			if (!C) return;
			C->ServerDropSlot(SlotIndex, bIsHotbar, 1);
		}))
		.OnDroppedOutside(FOnKBVESlotDroppedOutside::CreateLambda([this](const FVector2D&)
		{
			AchuckCoreCharacter* C = Character.Get();
			if (!C) return;
			C->ServerDropSlot(SlotIndex, bIsHotbar, 1);
		}))
		.OnHover(FOnKBVESlotHover::CreateSP(this, &SchuckInventorySlot::OnHover))
		.DragDomain(OwnDomain)
		.SlotIndex(SlotIndex)
		.AcceptedDomains(Accepted)
		.OnGetPayloadKey(FOnKBVESlotPayloadKey::CreateLambda([this]() -> int32
		{
			const FchuckInventoryStack* S = GetStack();
			return S ? S->ItemKey : 0;
		}))
		.OnBuildDecorator(FOnKBVESlotBuildDecorator::CreateSP(this, &SchuckInventorySlot::BuildDragDecorator))
		.OnDropped(FOnKBVESlotDropped::CreateLambda([this](int32 SourceIndex, FName SourceDomain)
		{
			AchuckCoreCharacter* C = Character.Get();
			if (!C) return;

			const FName OwnD = bIsHotbar ? FName(TEXT("chuck.hotbar")) : FName(TEXT("chuck.bag"));
			if (SourceDomain == OwnD)
			{
				C->SwapBagSlots(SourceIndex, SlotIndex, bIsHotbar);
				return;
			}

			const bool bSourceIsHotbar = (SourceDomain == FName(TEXT("chuck.hotbar")));
			const int32 BagIdx    = bSourceIsHotbar ? SlotIndex   : SourceIndex;
			const int32 HotbarIdx = bSourceIsHotbar ? SourceIndex : SlotIndex;
			C->SwapAcrossContainers(BagIdx, HotbarIdx);
		}))
	];
}

TSharedPtr<SWidget> SchuckInventorySlot::BuildDragDecorator() const
{
	const FchuckItemDef* Def = GetDef();
	UchuckItemDB* DB = GetDB();
	if (!Def || !DB || !DB->HasAtlas() || !DB->GetAtlasHandle().IsValid())
	{
		return nullptr;
	}
	FVector2D UVTL, UVBR;
	DB->GetIconUV(Def->Key, UVTL, UVBR);

	return SNew(SchuckDragIcon)
		.AtlasHandle(DB->GetAtlasHandle())
		.UVTL(UVTL)
		.UVBR(UVBR)
		.IconSize(SlotSize * 1.15f)
		.Alpha(0.9f);
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
		const FchuckInventoryStack* Stack = GetStack();
		if (Def)
		{
			P.Text = FText::FromString(Def->Name);
			FString RarityName;
			switch (Def->Rarity)
			{
				case EchuckItemRarity::Common:    RarityName = TEXT("Common");    break;
				case EchuckItemRarity::Uncommon:  RarityName = TEXT("Uncommon");  break;
				case EchuckItemRarity::Rare:      RarityName = TEXT("Rare");      break;
				case EchuckItemRarity::Epic:      RarityName = TEXT("Epic");      break;
				case EchuckItemRarity::Legendary: RarityName = TEXT("Legendary"); break;
				case EchuckItemRarity::Mythic:    RarityName = TEXT("Mythic");    break;
				default:                          RarityName = TEXT("");
			}

			TArray<FString> SubParts;
			if (!RarityName.IsEmpty()) SubParts.Add(RarityName);
			if (Def->bConsumable)      SubParts.Add(TEXT("Consumable"));
			if (Stack && Stack->Count > 1) SubParts.Add(FString::Printf(TEXT("x%d"), Stack->Count));
			P.Subtitle = FText::FromString(FString::Join(SubParts, TEXT("  -  ")));

			TArray<FString> BodyLines;
			if (!Def->Description.IsEmpty())
			{
				BodyLines.Add(Def->Description);
			}
			TArray<FString> Stats;
			if (Def->HealHP    > 0.f) Stats.Add(FString::Printf(TEXT("+%d HP"), FMath::RoundToInt(Def->HealHP)));
			if (Def->RestoreMP > 0.f) Stats.Add(FString::Printf(TEXT("+%d MP"), FMath::RoundToInt(Def->RestoreMP)));
			if (Def->RestoreEP > 0.f) Stats.Add(FString::Printf(TEXT("+%d EP"), FMath::RoundToInt(Def->RestoreEP)));
			if (Stats.Num() > 0) BodyLines.Add(FString::Join(Stats, TEXT("   ")));
			TArray<FString> PriceParts;
			if (Def->BuyPrice  > 0) PriceParts.Add(FString::Printf(TEXT("Buy %d"),  Def->BuyPrice));
			if (Def->SellPrice > 0) PriceParts.Add(FString::Printf(TEXT("Sell %d"), Def->SellPrice));
			if (PriceParts.Num() > 0) BodyLines.Add(FString::Join(PriceParts, TEXT("   ")));

			P.Body = FText::FromString(FString::Join(BodyLines, LINE_TERMINATOR));

			const FLinearColor R = chuckItem::RarityColor(Def->Rarity);
			P.TitleColor  = R;
			P.BorderColor = FLinearColor(R.R, R.G, R.B, 0.95f);
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
