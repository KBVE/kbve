#include "KBVEItemDatabase.h"

#include "KBVEItemCatalogStore.h"
#include "Generated/KBVEItemDBProtoTypes.h"
#include "Generated/KBVEItemDBProtoParse.h"
#include "KBVEYYJson.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

namespace
{
	EKBVEItemRarity ParseRarity(const FString& Raw)
	{
		const FString R = Raw.ToUpper();
		if (R.Contains(TEXT("MYTHIC")))    return EKBVEItemRarity::Mythic;
		if (R.Contains(TEXT("LEGENDARY"))) return EKBVEItemRarity::Legendary;
		if (R.Contains(TEXT("EPIC")))      return EKBVEItemRarity::Epic;
		if (R.Contains(TEXT("RARE")))      return EKBVEItemRarity::Rare;
		if (R.Contains(TEXT("UNCOMMON")))  return EKBVEItemRarity::Uncommon;
		return EKBVEItemRarity::Common;
	}

	// Map the generated proto-mirror struct onto the curated runtime def.
	// The generated Populate owns all JSON field reads; this is the only
	// hand-written seam (DTO -> domain), centralized in one place.
	FKBVEItemDef MapGenToDef(const FKBVEGenItem& G)
	{
		FKBVEItemDef Def;
		Def.Key         = G.Key;
		Def.Ref         = FName(*G.Ref);
		Def.Name        = G.Name;
		Def.Description = G.Description;
		Def.Emoji       = G.Emoji;
		Def.TypeFlags   = G.TypeFlags;
		Def.Rarity      = ParseRarity(G.Rarity);
		Def.MaxStack    = G.MaxStack > 0 ? G.MaxStack : 1;
		Def.bStackable  = G.Stackable;
		Def.BuyPrice    = G.BuyPrice;
		Def.SellPrice   = G.SellPrice;
		Def.Weight      = G.Weight;
		Def.bConsumable = G.Consumable;
		Def.Cooldown    = static_cast<float>(G.Cooldown);
		Def.Action      = G.Action;
		if (!G.AnimationRef.IsEmpty()) Def.AnimationRef = FName(*G.AnimationRef);
		if (!G.SoundRef.IsEmpty())     Def.SoundRef     = FName(*G.SoundRef);

		for (const FString& Tag : G.Tags)
		{
			if (!Tag.IsEmpty()) Def.Tags.Add(FName(*Tag));
		}

		Def.Food.Heals            = static_cast<float>(G.Food.Heals);
		Def.Food.RestoreMana      = static_cast<float>(G.Food.RestoreMana);
		Def.Food.RestoreEnergy    = static_cast<float>(G.Food.RestoreEnergy);
		Def.Food.RegenPerSecond   = G.Food.RegenPerSecond;
		Def.Food.RegenDuration    = G.Food.RegenDuration;
		Def.Food.bPerishable      = G.Food.Perishable;
		Def.Food.ShelfLifeSeconds = G.Food.ShelfLifeSeconds;
		if (!G.Food.SpoilsIntoRef.IsEmpty()) Def.Food.SpoilsIntoRef = FName(*G.Food.SpoilsIntoRef);

		const bool bTypeConsumable =
			(Def.TypeFlags & 0x08) != 0 || (Def.TypeFlags & 0x10) != 0 || (Def.TypeFlags & 0x20) != 0;
		Def.bHasFood =
			bTypeConsumable || Def.Food.Heals > 0.f || Def.Food.RestoreMana > 0.f ||
			Def.Food.RestoreEnergy > 0.f || Def.Food.RegenPerSecond > 0.f;
		if (bTypeConsumable) Def.bConsumable = true;

		return Def;
	}
}

void UKBVEItemDatabase::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	const FString DefaultPath = FPaths::ProjectContentDir() / TEXT("Data/itemdb-data.json");
	if (FPaths::FileExists(DefaultPath))
	{
		LoadFromFile(DefaultPath);
	}
	else
	{
		UE_LOG(LogTemp, Log, TEXT("[KBVEItemDB] itemdb-data.json not found at %s — call LoadFromFile explicitly."), *DefaultPath);
	}
}

void UKBVEItemDatabase::Deinitialize()
{
	Items.Reset();
	KeyToIndex.Reset();
	RefToIndex.Reset();
	Super::Deinitialize();
}

bool UKBVEItemDatabase::LoadFromFile(const FString& FilePath)
{
	FString JsonText;
	if (!FFileHelper::LoadFileToString(JsonText, *FilePath))
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEItemDB] failed to read %s"), *FilePath);
		return false;
	}
	return LoadFromJson(JsonText);
}

bool UKBVEItemDatabase::LoadFromJson(const FString& JsonText)
{
	const FTCHARToUTF8 Utf8(*JsonText);
	yyjson_doc* Doc = yyjson_read(Utf8.Get(), Utf8.Length(), 0);
	if (!Doc)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEItemDB] itemdb JSON parse failed"));
		return false;
	}

	yyjson_val* Root = yyjson_doc_get_root(Doc);
	yyjson_val* Arr  = Root ? yyjson_obj_get(Root, "items") : nullptr;
	if (!Arr || !yyjson_is_arr(Arr))
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEItemDB] itemdb JSON has no 'items' array"));
		yyjson_doc_free(Doc);
		return false;
	}

	Items.Reset();
	KeyToIndex.Reset();
	RefToIndex.Reset();
	Items.Reserve((int32)yyjson_arr_size(Arr));

	size_t Idx, MaxN;
	yyjson_val* ItemVal;
	yyjson_arr_foreach(Arr, Idx, MaxN, ItemVal)
	{
		FKBVEGenItem Gen;
		KBVEItemDBProto::Populate(Gen, ItemVal);
		if (Gen.Key <= 0 || Gen.Ref.IsEmpty()) continue;

		FKBVEItemDef Def = MapGenToDef(Gen);
		KeyToIndex.Add(Def.Key, Items.Num());
		RefToIndex.Add(Def.Ref, Items.Num());
		Items.Add(MoveTemp(Def));
	}

	yyjson_doc_free(Doc);
	UE_LOG(LogTemp, Log, TEXT("[KBVEItemDB] loaded %d item defs (generated parse)"), Items.Num());
	return true;
}

const FKBVEItemDef* UKBVEItemDatabase::LookupByKey(int32 Key) const
{
	if (const int32* Index = KeyToIndex.Find(Key))
	{
		return &Items[*Index];
	}
	return nullptr;
}

const FKBVEItemDef* UKBVEItemDatabase::LookupByRef(FName Ref) const
{
	if (const int32* Index = RefToIndex.Find(Ref))
	{
		return &Items[*Index];
	}
	return nullptr;
}

bool UKBVEItemDatabase::GetItemByKey(int32 Key, FKBVEItemDef& OutDef) const
{
	if (const FKBVEItemDef* Def = LookupByKey(Key))
	{
		OutDef = *Def;
		return true;
	}
	return false;
}

bool UKBVEItemDatabase::GetItemByRef(FName Ref, FKBVEItemDef& OutDef) const
{
	if (const FKBVEItemDef* Def = LookupByRef(Ref))
	{
		OutDef = *Def;
		return true;
	}
	return false;
}

bool UKBVEItemDatabase::PersistCatalogToDb(const FString& DbPath) const
{
	FKBVEItemCatalogStore Store;
	if (!Store.Open(DbPath))
	{
		return false;
	}
	const bool bOk = Store.SaveCatalog(Items);
	Store.Close();
	return bOk;
}
