#include "KBVEItemDatabase.h"

#include "KBVEItemCatalogStore.h"
#include "KBVEItemMap.h"
#include "Generated/KBVEItemDBProtoTypes.h"
#include "Generated/KBVEItemDBProtoParse.h"
#include "KBVEYYJson.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

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

		FKBVEItemDef Def = KBVEItemMap::FromGen(Gen);
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
