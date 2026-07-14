#include "KBVESpellDatabase.h"

#include "Generated/KBVESpellDBProtoTypes.h"
#include "Generated/KBVESpellDBProtoParse.h"
#include "KBVEYYJson.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

void UKBVESpellDatabase::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	const FString DefaultPath = FPaths::ProjectContentDir() / TEXT("Data/spelldb-data.json");
	if (FPaths::FileExists(DefaultPath))
	{
		LoadFromFile(DefaultPath);
	}
	else
	{
		UE_LOG(LogTemp, Log, TEXT("[KBVESpellDB] spelldb-data.json not found at %s — call LoadFromFile explicitly."), *DefaultPath);
	}
}

void UKBVESpellDatabase::Deinitialize()
{
	Spells.Reset();
	RefToIndex.Reset();
	KeyToIndex.Reset();
	Super::Deinitialize();
}

bool UKBVESpellDatabase::LoadFromFile(const FString& FilePath)
{
	FString JsonText;
	if (!FFileHelper::LoadFileToString(JsonText, *FilePath))
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVESpellDB] failed to read %s"), *FilePath);
		return false;
	}
	return LoadFromJson(JsonText);
}

bool UKBVESpellDatabase::LoadFromJson(const FString& JsonText)
{
	const FTCHARToUTF8 Utf8(*JsonText);
	yyjson_doc* Doc = yyjson_read(Utf8.Get(), Utf8.Length(), 0);
	if (!Doc)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVESpellDB] spelldb JSON parse failed"));
		return false;
	}

	yyjson_val* Root = yyjson_doc_get_root(Doc);
	yyjson_val* Arr  = Root ? yyjson_obj_get(Root, "spells") : nullptr;
	if (!Arr || !yyjson_is_arr(Arr))
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVESpellDB] spelldb JSON has no 'spells' array"));
		yyjson_doc_free(Doc);
		return false;
	}

	Spells.Reset();
	RefToIndex.Reset();
	KeyToIndex.Reset();
	Spells.Reserve((int32)yyjson_arr_size(Arr));

	size_t Idx, MaxN;
	yyjson_val* SpellVal;
	yyjson_arr_foreach(Arr, Idx, MaxN, SpellVal)
	{
		FKBVEGenSpell Gen;
		KBVESpellDBProto::Populate(Gen, SpellVal);
		if (Gen.Ref.IsEmpty()) continue;

		const int32 Index = Spells.Num();
		RefToIndex.Add(FName(*Gen.Ref), Index);
		if (Gen.Key > 0) KeyToIndex.Add(Gen.Key, Index);
		Spells.Add(MoveTemp(Gen));
	}

	yyjson_doc_free(Doc);
	UE_LOG(LogTemp, Log, TEXT("[KBVESpellDB] loaded %d spell defs (generated parse)"), Spells.Num());
	return true;
}

const FKBVEGenSpell* UKBVESpellDatabase::LookupByRef(FName Ref) const
{
	if (const int32* Index = RefToIndex.Find(Ref))
	{
		return &Spells[*Index];
	}
	return nullptr;
}

const FKBVEGenSpell* UKBVESpellDatabase::LookupByKey(int32 Key) const
{
	if (const int32* Index = KeyToIndex.Find(Key))
	{
		return &Spells[*Index];
	}
	return nullptr;
}

bool UKBVESpellDatabase::GetSpellByRef(FName Ref, FKBVEGenSpell& OutSpell) const
{
	if (const FKBVEGenSpell* Def = LookupByRef(Ref))
	{
		OutSpell = *Def;
		return true;
	}
	return false;
}

bool UKBVESpellDatabase::GetSpellByKey(int32 Key, FKBVEGenSpell& OutSpell) const
{
	if (const FKBVEGenSpell* Def = LookupByKey(Key))
	{
		OutSpell = *Def;
		return true;
	}
	return false;
}
