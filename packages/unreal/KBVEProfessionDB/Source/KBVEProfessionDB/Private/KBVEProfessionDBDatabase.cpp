#include "KBVEProfessionDBDatabase.h"

#include "KBVEProfessionMap.h"
#include "Generated/KBVEProfessionDBProtoTypes.h"
#include "Generated/KBVEProfessionDBProtoParse.h"
#include "KBVEYYJson.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

void UKBVEProfessionDBDatabase::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	const FString DefaultPath = FPaths::ProjectContentDir() / TEXT("Data/professiondb-data.json");
	if (FPaths::FileExists(DefaultPath))
	{
		LoadFromFile(DefaultPath);
	}
	else
	{
		UE_LOG(LogTemp, Log, TEXT("[KBVEProfessionDB] professiondb-data.json not found at %s — call LoadFromFile explicitly."), *DefaultPath);
	}
}

void UKBVEProfessionDBDatabase::Deinitialize()
{
	Actions.Reset();
	Professions.Reset();
	ActionRefToIndex.Reset();
	ProfessionRefToIndex.Reset();
	Super::Deinitialize();
}

bool UKBVEProfessionDBDatabase::LoadFromFile(const FString& FilePath)
{
	FString JsonText;
	if (!FFileHelper::LoadFileToString(JsonText, *FilePath))
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEProfessionDB] failed to read %s"), *FilePath);
		return false;
	}
	return LoadFromJson(JsonText);
}

bool UKBVEProfessionDBDatabase::LoadFromJson(const FString& JsonText)
{
	const FTCHARToUTF8 Utf8(*JsonText);
	yyjson_doc* Doc = yyjson_read(Utf8.Get(), Utf8.Length(), 0);
	if (!Doc)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEProfessionDB] professiondb JSON parse failed"));
		return false;
	}

	yyjson_val* Root = yyjson_doc_get_root(Doc);
	yyjson_val* ProfArr = Root ? yyjson_obj_get(Root, "professions") : nullptr;
	if (!ProfArr || !yyjson_is_arr(ProfArr))
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEProfessionDB] professiondb JSON has no 'professions' array"));
		yyjson_doc_free(Doc);
		return false;
	}

	Actions.Reset();
	Professions.Reset();
	ActionRefToIndex.Reset();
	ProfessionRefToIndex.Reset();
	Professions.Reserve((int32)yyjson_arr_size(ProfArr));

	size_t Idx, MaxN;
	yyjson_val* ProfVal;
	yyjson_arr_foreach(ProfArr, Idx, MaxN, ProfVal)
	{
		FKBVEGenProfession Gen;
		KBVEProfessionDBProto::Populate(Gen, ProfVal);
		if (Gen.Ref.IsEmpty()) continue;

		FKBVEProfessionDef Def = KBVEProfessionMap::FromGen(Gen);

		for (const FKBVEGenProfessionAction& GenAction : Gen.Actions)
		{
			if (GenAction.Ref.IsEmpty()) continue;

			FKBVEProfessionActionDef ActionDef = KBVEProfessionMap::FromGen(Gen, GenAction);
			ActionRefToIndex.Add(ActionDef.Ref, Actions.Num());
			Actions.Add(MoveTemp(ActionDef));
		}

		ProfessionRefToIndex.Add(Def.Ref, Professions.Num());
		Professions.Add(MoveTemp(Def));
	}

	yyjson_doc_free(Doc);
	UE_LOG(LogTemp, Log, TEXT("[KBVEProfessionDB] loaded %d professions, %d actions (generated parse)"), Professions.Num(), Actions.Num());
	return true;
}

const FKBVEProfessionActionDef* UKBVEProfessionDBDatabase::LookupActionByRef(FName Ref) const
{
	if (const int32* Index = ActionRefToIndex.Find(Ref))
	{
		return &Actions[*Index];
	}
	return nullptr;
}

bool UKBVEProfessionDBDatabase::GetActionByRef(FName Ref, FKBVEProfessionActionDef& OutDef) const
{
	if (const FKBVEProfessionActionDef* Def = LookupActionByRef(Ref))
	{
		OutDef = *Def;
		return true;
	}
	return false;
}

TArray<FKBVEProfessionActionDef> UKBVEProfessionDBDatabase::GetActionsByProfession(FName ProfessionRef) const
{
	TArray<FKBVEProfessionActionDef> Out;
	for (const FKBVEProfessionActionDef& A : Actions)
	{
		if (A.ProfessionRef == ProfessionRef) Out.Add(A);
	}
	return Out;
}

const FKBVEProfessionDef* UKBVEProfessionDBDatabase::FindProfessionByRef(FName Ref) const
{
	if (const int32* Index = ProfessionRefToIndex.Find(Ref))
	{
		return &Professions[*Index];
	}
	return nullptr;
}

bool UKBVEProfessionDBDatabase::GetProfessionByRef(FName Ref, FKBVEProfessionDef& OutDef) const
{
	if (const FKBVEProfessionDef* Def = FindProfessionByRef(Ref))
	{
		OutDef = *Def;
		return true;
	}
	return false;
}
