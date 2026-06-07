#include "KBVEQuestDatabase.h"

#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

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
	RefToIndex.Reset();
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
	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonText);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEQuestDB] questdb JSON parse failed"));
		return false;
	}

	const TArray<TSharedPtr<FJsonValue>>* QuestArray = nullptr;
	if (!Root->TryGetArrayField(TEXT("quests"), QuestArray) || QuestArray == nullptr)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEQuestDB] questdb JSON has no 'quests' array"));
		return false;
	}

	Quests.Reset();
	RefToIndex.Reset();
	Quests.Reserve(QuestArray->Num());

	for (const TSharedPtr<FJsonValue>& Value : *QuestArray)
	{
		const TSharedPtr<FJsonObject>* ObjPtr = nullptr;
		if (!Value.IsValid() || !Value->TryGetObject(ObjPtr) || ObjPtr == nullptr)
		{
			continue;
		}
		const TSharedPtr<FJsonObject>& Obj = *ObjPtr;

		FKBVEQuestDef Def;
		FString Str;
		if (Obj->TryGetStringField(TEXT("ref"), Str)) Def.Ref = FName(*Str);
		if (Def.Ref.IsNone()) continue;

		Obj->TryGetStringField(TEXT("id"), Def.Id);
		Obj->TryGetStringField(TEXT("title"), Def.Title);
		Obj->TryGetStringField(TEXT("description"), Def.Description);
		Obj->TryGetStringField(TEXT("icon"), Def.Icon);
		if (Obj->TryGetStringField(TEXT("category"), Str)) Def.Category = FName(*Str);
		Obj->TryGetBoolField(TEXT("hidden"), Def.bHidden);
		Obj->TryGetBoolField(TEXT("repeatable"), Def.bRepeatable);
		Obj->TryGetNumberField(TEXT("recommendedLevel"), Def.RecommendedLevel);
		if (Obj->TryGetStringField(TEXT("nextQuestRef"), Str)) Def.NextQuestRef = FName(*Str);

		const TArray<TSharedPtr<FJsonValue>>* ObjectiveArray = nullptr;
		if (Obj->TryGetArrayField(TEXT("objectives"), ObjectiveArray) && ObjectiveArray)
		{
			for (const TSharedPtr<FJsonValue>& OV : *ObjectiveArray)
			{
				const TSharedPtr<FJsonObject>* OObjPtr = nullptr;
				if (!OV.IsValid() || !OV->TryGetObject(OObjPtr) || OObjPtr == nullptr) continue;
				const TSharedPtr<FJsonObject>& OObj = *OObjPtr;

				FKBVEQuestObjective Objective;
				if (OObj->TryGetStringField(TEXT("id"), Str)) Objective.Id = FName(*Str);
				OObj->TryGetStringField(TEXT("description"), Objective.Description);
				if (OObj->TryGetStringField(TEXT("type"), Str)) Objective.Type = FName(*Str);
				OObj->TryGetNumberField(TEXT("requiredAmount"), Objective.RequiredAmount);

				const TArray<TSharedPtr<FJsonValue>>* Targets = nullptr;
				if (OObj->TryGetArrayField(TEXT("targetRefs"), Targets) && Targets)
				{
					for (const TSharedPtr<FJsonValue>& T : *Targets)
					{
						FString TgtRef;
						if (T.IsValid() && T->TryGetString(TgtRef)) Objective.TargetRefs.Add(FName(*TgtRef));
					}
				}
				Def.Objectives.Add(MoveTemp(Objective));
			}
		}

		const TSharedPtr<FJsonObject>* RewardsObj = nullptr;
		if (Obj->TryGetObjectField(TEXT("rewards"), RewardsObj) && RewardsObj)
		{
			(*RewardsObj)->TryGetNumberField(TEXT("currency"), Def.Rewards.Currency);
			(*RewardsObj)->TryGetNumberField(TEXT("xp"), Def.Rewards.Xp);
			if ((*RewardsObj)->TryGetStringField(TEXT("unlockRef"), Str)) Def.Rewards.UnlockRef = FName(*Str);

			const TArray<TSharedPtr<FJsonValue>>* ItemRewards = nullptr;
			if ((*RewardsObj)->TryGetArrayField(TEXT("items"), ItemRewards) && ItemRewards)
			{
				for (const TSharedPtr<FJsonValue>& IV : *ItemRewards)
				{
					const TSharedPtr<FJsonObject>* IObjPtr = nullptr;
					if (!IV.IsValid() || !IV->TryGetObject(IObjPtr) || IObjPtr == nullptr) continue;
					FKBVEQuestItemReward ItemReward;
					if ((*IObjPtr)->TryGetStringField(TEXT("itemRef"), Str)) ItemReward.ItemRef = FName(*Str);
					(*IObjPtr)->TryGetNumberField(TEXT("amount"), ItemReward.Amount);
					Def.Rewards.Items.Add(ItemReward);
				}
			}
		}

		const TArray<TSharedPtr<FJsonValue>>* TagArray = nullptr;
		if (Obj->TryGetArrayField(TEXT("tags"), TagArray) && TagArray)
		{
			for (const TSharedPtr<FJsonValue>& T : *TagArray)
			{
				FString Tag;
				if (T.IsValid() && T->TryGetString(Tag)) Def.Tags.Add(FName(*Tag));
			}
		}

		RefToIndex.Add(Def.Ref, Quests.Num());
		Quests.Add(MoveTemp(Def));
	}

	UE_LOG(LogTemp, Log, TEXT("[KBVEQuestDB] loaded %d quest defs"), Quests.Num());
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
