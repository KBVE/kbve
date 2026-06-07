#include "KBVEItemDatabase.h"

#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

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

	void GetFloat(const TSharedPtr<FJsonObject>& O, const TCHAR* Field, float& Out)
	{
		double D = 0.0;
		if (O->TryGetNumberField(Field, D))
		{
			Out = static_cast<float>(D);
		}
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
	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonText);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEItemDB] itemdb JSON parse failed"));
		return false;
	}

	const TArray<TSharedPtr<FJsonValue>>* ItemArray = nullptr;
	if (!Root->TryGetArrayField(TEXT("items"), ItemArray) || ItemArray == nullptr)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEItemDB] itemdb JSON has no 'items' array"));
		return false;
	}

	Items.Reset();
	KeyToIndex.Reset();
	RefToIndex.Reset();
	Items.Reserve(ItemArray->Num());

	for (const TSharedPtr<FJsonValue>& Value : *ItemArray)
	{
		const TSharedPtr<FJsonObject>* ObjPtr = nullptr;
		if (!Value.IsValid() || !Value->TryGetObject(ObjPtr) || ObjPtr == nullptr)
		{
			continue;
		}
		const TSharedPtr<FJsonObject>& Obj = *ObjPtr;

		FKBVEItemDef Def;

		Obj->TryGetNumberField(TEXT("key"), Def.Key);

		FString Str;
		if (Obj->TryGetStringField(TEXT("ref"), Str)) Def.Ref = FName(*Str);
		if (Def.Key <= 0 || Def.Ref.IsNone()) continue;

		Obj->TryGetStringField(TEXT("name"), Def.Name);
		Obj->TryGetStringField(TEXT("description"), Def.Description);
		Obj->TryGetStringField(TEXT("emoji"), Def.Emoji);
		Obj->TryGetNumberField(TEXT("typeFlags"), Def.TypeFlags);
		Obj->TryGetNumberField(TEXT("maxStack"), Def.MaxStack);
		Obj->TryGetBoolField(TEXT("stackable"), Def.bStackable);
		Obj->TryGetNumberField(TEXT("buyPrice"), Def.BuyPrice);
		Obj->TryGetNumberField(TEXT("sellPrice"), Def.SellPrice);
		GetFloat(Obj, TEXT("weight"), Def.Weight);
		Obj->TryGetBoolField(TEXT("consumable"), Def.bConsumable);
		GetFloat(Obj, TEXT("cooldown"), Def.Cooldown);
		Obj->TryGetStringField(TEXT("action"), Def.Action);
		if (Obj->TryGetStringField(TEXT("animationRef"), Str)) Def.AnimationRef = FName(*Str);
		if (Obj->TryGetStringField(TEXT("soundRef"), Str)) Def.SoundRef = FName(*Str);
		if (Obj->TryGetStringField(TEXT("rarity"), Str)) Def.Rarity = ParseRarity(Str);

		if (Def.MaxStack <= 0) Def.MaxStack = 1;

		const TArray<TSharedPtr<FJsonValue>>* TagArray = nullptr;
		if (Obj->TryGetArrayField(TEXT("tags"), TagArray) && TagArray)
		{
			for (const TSharedPtr<FJsonValue>& T : *TagArray)
			{
				FString Tag;
				if (T.IsValid() && T->TryGetString(Tag))
				{
					Def.Tags.Add(FName(*Tag));
				}
			}
		}

		const TSharedPtr<FJsonObject>* FoodObj = nullptr;
		if (Obj->TryGetObjectField(TEXT("food"), FoodObj) && FoodObj)
		{
			Def.bHasFood = true;
			GetFloat(*FoodObj, TEXT("heals"), Def.Food.Heals);
			GetFloat(*FoodObj, TEXT("restoreMana"), Def.Food.RestoreMana);
			GetFloat(*FoodObj, TEXT("restoreEnergy"), Def.Food.RestoreEnergy);
			GetFloat(*FoodObj, TEXT("regenPerSecond"), Def.Food.RegenPerSecond);
			GetFloat(*FoodObj, TEXT("regenDuration"), Def.Food.RegenDuration);
			(*FoodObj)->TryGetBoolField(TEXT("perishable"), Def.Food.bPerishable);
			(*FoodObj)->TryGetNumberField(TEXT("shelfLifeSeconds"), Def.Food.ShelfLifeSeconds);
			if ((*FoodObj)->TryGetStringField(TEXT("spoilsIntoRef"), Str)) Def.Food.SpoilsIntoRef = FName(*Str);
		}

		if (!Def.bHasFood && Def.bConsumable)
		{
			GetFloat(Obj, TEXT("healHP"), Def.Food.Heals);
			GetFloat(Obj, TEXT("restoreMP"), Def.Food.RestoreMana);
			GetFloat(Obj, TEXT("restoreEP"), Def.Food.RestoreEnergy);
		}

		KeyToIndex.Add(Def.Key, Items.Num());
		RefToIndex.Add(Def.Ref, Items.Num());
		Items.Add(MoveTemp(Def));
	}

	UE_LOG(LogTemp, Log, TEXT("[KBVEItemDB] loaded %d item defs"), Items.Num());
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
