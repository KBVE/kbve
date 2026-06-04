#include "SchuckItemInfo.h"

#include "chuckCoreCharacter.h"
#include "chuckItemDB.h"
#include "chuckItemTypes.h"
#include "Engine/GameInstance.h"
#include "Rendering/DrawElements.h"
#include "SKBVEInfoPanel.h"

void SchuckItemInfo::Construct(const FArguments& InArgs)
{
	Character   = InArgs._OwningCharacter;
	SelectedKey = InArgs._SelectedKey;

	ChildSlot
	[
		SNew(SKBVEInfoPanel)
		.IconSize(96.f)
		.HasContent(TAttribute<bool>::CreateSP(this, &SchuckItemInfo::HasContent))
		.Title(TAttribute<FText>::CreateSP(this, &SchuckItemInfo::GetTitle))
		.Subtitle(TAttribute<FText>::CreateSP(this, &SchuckItemInfo::GetSubtitle))
		.Detail(TAttribute<FText>::CreateSP(this, &SchuckItemInfo::GetDetail))
		.Body(TAttribute<FText>::CreateSP(this, &SchuckItemInfo::GetBody))
		.TitleColor(TAttribute<FSlateColor>::CreateSP(this, &SchuckItemInfo::GetTitleColor))
		.EmptyHint(NSLOCTEXT("SchuckItemInfo", "Empty", "Click an item to inspect"))
		.OnPaintIcon(FOnKBVEInfoPaintIcon::CreateSP(this, &SchuckItemInfo::PaintIcon))
	];
}

UchuckItemDB* SchuckItemInfo::GetDB() const
{
	AchuckCoreCharacter* C = Character.Get();
	if (!C) return nullptr;
	UGameInstance* GI = C->GetGameInstance();
	return GI ? GI->GetSubsystem<UchuckItemDB>() : nullptr;
}

const FchuckItemDef* SchuckItemInfo::GetDef() const
{
	if (!SelectedKey.IsValid()) return nullptr;
	UchuckItemDB* DB = GetDB();
	return DB ? DB->LookupByKey(*SelectedKey) : nullptr;
}

bool SchuckItemInfo::HasContent() const
{
	return GetDef() != nullptr;
}

FText SchuckItemInfo::GetTitle() const
{
	const FchuckItemDef* Def = GetDef();
	return Def ? FText::FromString(Def->Name) : FText::GetEmpty();
}

FText SchuckItemInfo::GetSubtitle() const
{
	const FchuckItemDef* Def = GetDef();
	if (!Def) return FText::GetEmpty();
	const TCHAR* RarityName = TEXT("Common");
	switch (Def->Rarity)
	{
		case EchuckItemRarity::Common:    RarityName = TEXT("Common");    break;
		case EchuckItemRarity::Uncommon:  RarityName = TEXT("Uncommon");  break;
		case EchuckItemRarity::Rare:      RarityName = TEXT("Rare");      break;
		case EchuckItemRarity::Epic:      RarityName = TEXT("Epic");      break;
		case EchuckItemRarity::Legendary: RarityName = TEXT("Legendary"); break;
		case EchuckItemRarity::Mythic:    RarityName = TEXT("Mythic");    break;
	}
	return FText::FromString(FString::Printf(TEXT("%s    ref: %s"), RarityName, *Def->Ref.ToString()));
}

FText SchuckItemInfo::GetDetail() const
{
	const FchuckItemDef* Def = GetDef();
	if (!Def) return FText::GetEmpty();
	return FText::FromString(FString::Printf(
		TEXT("Buy %d   Sell %d   Stack %d%s"),
		Def->BuyPrice, Def->SellPrice,
		Def->MaxStack > 1 ? Def->MaxStack : 1,
		Def->bConsumable ? TEXT("   consumable") : TEXT("")));
}

FText SchuckItemInfo::GetBody() const
{
	const FchuckItemDef* Def = GetDef();
	if (!Def) return FText::GetEmpty();
	FString Desc = Def->Description;
	Desc.ReplaceInline(TEXT("\n"), TEXT(" "));
	return FText::FromString(Desc);
}

FSlateColor SchuckItemInfo::GetTitleColor() const
{
	const FchuckItemDef* Def = GetDef();
	return FSlateColor(Def ? chuckItem::RarityColor(Def->Rarity) : FLinearColor::White);
}

void SchuckItemInfo::PaintIcon(const FGeometry& Geom, FSlateWindowElementList& Out, int32 Layer, const FVector2D& IconSize)
{
	const FchuckItemDef* Def = GetDef();
	UchuckItemDB* DB = GetDB();
	if (!Def || !DB || !DB->HasAtlas() || !DB->GetAtlasHandle().IsValid() || Def->Img.IsEmpty())
	{
		return;
	}

	FVector2D UVTL, UVBR;
	DB->GetIconUV(Def->Key, UVTL, UVBR);

	const float Pad = 14.f;
	const FVector2D P0(Pad,             Pad);
	const FVector2D P1(Pad + IconSize.X, Pad);
	const FVector2D P2(Pad + IconSize.X, Pad + IconSize.Y);
	const FVector2D P3(Pad,             Pad + IconSize.Y);

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
