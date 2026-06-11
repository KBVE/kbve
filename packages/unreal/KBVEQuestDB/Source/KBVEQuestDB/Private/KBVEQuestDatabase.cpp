#include "KBVEQuestDatabase.h"

#include "KBVEQuestMap.h"
#include "Generated/KBVEQuestDBProtoTypes.h"
#include "Generated/KBVEQuestDBProtoParse.h"
#include "KBVEYYJson.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

void UKBVEQuestDatabase::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	const FString DefaultPath = FPaths::ProjectContentDir() / TEXT("Data/questdb-data.json");
	if (FPaths::FileExists(DefaultPath))
	{
		LoadFromFile(DefaultPath);
	}
	else
	{
		UE_LOG(LogTemp, Log, TEXT("[KBVEQuestDB] questdb-data.json not found at %s — call LoadFromFile explicitly."), *DefaultPath);
	}
}

void UKBVEQuestDatabase::Deinitialize()
{
	Quests.Reset();
	Chains.Reset();
	RefToIndex.Reset();
	ChainRefToIndex.Reset();
	Super::Deinitialize();
}

bool UKBVEQuestDatabase::LoadFromFile(const FString& FilePath)
{
	FString JsonText;
	if (!FFileHelper::LoadFileToString(JsonText, *FilePath))
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEQuestDB] failed to read %s"), *FilePath);
		return false;
	}
	return LoadFromJson(JsonText);
}

bool UKBVEQuestDatabase::LoadFromJson(const FString& JsonText)
{
	const FTCHARToUTF8 Utf8(*JsonText);
	yyjson_doc* Doc = yyjson_read(Utf8.Get(), Utf8.Length(), 0);
	if (!Doc)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEQuestDB] questdb JSON parse failed"));
		return false;
	}

	yyjson_val* Root = yyjson_doc_get_root(Doc);
	yyjson_val* QuestArr = Root ? yyjson_obj_get(Root, "quests") : nullptr;
	if (!QuestArr || !yyjson_is_arr(QuestArr))
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEQuestDB] questdb JSON has no 'quests' array"));
		yyjson_doc_free(Doc);
		return false;
	}

	Quests.Reset();
	Chains.Reset();
	RefToIndex.Reset();
	ChainRefToIndex.Reset();
	Quests.Reserve((int32)yyjson_arr_size(QuestArr));

	size_t Idx, MaxN;
	yyjson_val* QuestVal;
	yyjson_arr_foreach(QuestArr, Idx, MaxN, QuestVal)
	{
		FKBVEGenQuest Gen;
		KBVEQuestDBProto::Populate(Gen, QuestVal);
		if (Gen.Ref.IsEmpty()) continue;

		FKBVEQuestDef Def = KBVEQuestMap::FromGen(Gen);

		// Flattened top-level `objectives` (single-step MDX convenience) live
		// outside the proto Quest shape, so the generated parser skips them.
		if (Def.Steps.Num() == 0)
		{
			yyjson_val* ObjArr = yyjson_obj_get(QuestVal, "objectives");
			if (ObjArr && yyjson_is_arr(ObjArr))
			{
				size_t OIdx, OMax;
				yyjson_val* ObjVal;
				yyjson_arr_foreach(ObjArr, OIdx, OMax, ObjVal)
				{
					FKBVEGenQuestObjective GenObj;
					KBVEQuestDBProto::Populate(GenObj, ObjVal);
					Def.Objectives.Add(KBVEQuestMap::FromGen(GenObj));
				}
			}
		}

		RefToIndex.Add(Def.Ref, Quests.Num());
		Quests.Add(MoveTemp(Def));
	}

	yyjson_val* ChainArr = yyjson_obj_get(Root, "chains");
	if (ChainArr && yyjson_is_arr(ChainArr))
	{
		Chains.Reserve((int32)yyjson_arr_size(ChainArr));
		size_t CIdx, CMax;
		yyjson_val* ChainVal;
		yyjson_arr_foreach(ChainArr, CIdx, CMax, ChainVal)
		{
			FKBVEGenQuestChain GenChain;
			KBVEQuestDBProto::Populate(GenChain, ChainVal);
			if (GenChain.Ref.IsEmpty()) continue;

			FKBVEQuestChainDef ChainDef = KBVEQuestMap::FromGen(GenChain);
			ChainRefToIndex.Add(ChainDef.Ref, Chains.Num());
			Chains.Add(MoveTemp(ChainDef));
		}
	}

	yyjson_doc_free(Doc);
	UE_LOG(LogTemp, Log, TEXT("[KBVEQuestDB] loaded %d quest defs, %d chains (generated parse)"), Quests.Num(), Chains.Num());
	return true;
}

const FKBVEQuestDef* UKBVEQuestDatabase::FindByRef(FName Ref) const
{
	if (const int32* Index = RefToIndex.Find(Ref))
	{
		return &Quests[*Index];
	}
	return nullptr;
}

bool UKBVEQuestDatabase::GetQuestByRef(FName Ref, FKBVEQuestDef& OutDef) const
{
	if (const FKBVEQuestDef* Def = FindByRef(Ref))
	{
		OutDef = *Def;
		return true;
	}
	return false;
}

const FKBVEQuestChainDef* UKBVEQuestDatabase::FindChainByRef(FName Ref) const
{
	if (const int32* Index = ChainRefToIndex.Find(Ref))
	{
		return &Chains[*Index];
	}
	return nullptr;
}

bool UKBVEQuestDatabase::GetChainByRef(FName Ref, FKBVEQuestChainDef& OutDef) const
{
	if (const FKBVEQuestChainDef* Def = FindChainByRef(Ref))
	{
		OutDef = *Def;
		return true;
	}
	return false;
}

TArray<FKBVEQuestDef> UKBVEQuestDatabase::GetQuestsByCategory(EKBVEQuestCategory Category) const
{
	TArray<FKBVEQuestDef> Out;
	for (const FKBVEQuestDef& Q : Quests)
	{
		if (Q.Category == Category) Out.Add(Q);
	}
	return Out;
}

TArray<FKBVEQuestDef> UKBVEQuestDatabase::GetQuestsByTag(FName Tag) const
{
	TArray<FKBVEQuestDef> Out;
	for (const FKBVEQuestDef& Q : Quests)
	{
		if (Q.Tags.Contains(Tag)) Out.Add(Q);
	}
	return Out;
}

TArray<FKBVEQuestDef> UKBVEQuestDatabase::GetQuestsByGiverNpc(FName NpcRef) const
{
	TArray<FKBVEQuestDef> Out;
	for (const FKBVEQuestDef& Q : Quests)
	{
		if (Q.GiverNpcRefs.Contains(NpcRef)) Out.Add(Q);
	}
	return Out;
}
