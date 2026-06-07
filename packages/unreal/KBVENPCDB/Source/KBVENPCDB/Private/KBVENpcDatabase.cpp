#include "KBVENpcDatabase.h"

#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void UKBVENpcDatabase::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	const FString DefaultPath = FPaths::ProjectContentDir() / TEXT("Data/npcdb-data.json");
	if (FPaths::FileExists(DefaultPath))
	{
		LoadFromFile(DefaultPath);
	}
	else
	{
		UE_LOG(LogTemp, Log, TEXT("[KBVENPCDB] npcdb-data.json not found at %s — call LoadFromFile explicitly."), *DefaultPath);
	}
}

void UKBVENpcDatabase::Deinitialize()
{
	Npcs.Reset();
	RefToIndex.Reset();
	Super::Deinitialize();
}

bool UKBVENpcDatabase::LoadFromFile(const FString& FilePath)
{
	FString JsonText;
	if (!FFileHelper::LoadFileToString(JsonText, *FilePath))
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVENPCDB] failed to read %s"), *FilePath);
		return false;
	}
	return LoadFromJson(JsonText);
}

bool UKBVENpcDatabase::LoadFromJson(const FString& JsonText)
{
	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonText);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVENPCDB] npcdb JSON parse failed"));
		return false;
	}

	const TArray<TSharedPtr<FJsonValue>>* NpcArray = nullptr;
	if (!Root->TryGetArrayField(TEXT("npcs"), NpcArray) || NpcArray == nullptr)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVENPCDB] npcdb JSON has no 'npcs' array"));
		return false;
	}

	Npcs.Reset();
	RefToIndex.Reset();
	Npcs.Reserve(NpcArray->Num());

	auto GetFloat = [](const TSharedPtr<FJsonObject>& O, const TCHAR* Field, float& Out)
	{
		double D = 0.0;
		if (O->TryGetNumberField(Field, D))
		{
			Out = static_cast<float>(D);
		}
	};

	for (const TSharedPtr<FJsonValue>& Value : *NpcArray)
	{
		const TSharedPtr<FJsonObject>* ObjPtr = nullptr;
		if (!Value.IsValid() || !Value->TryGetObject(ObjPtr) || ObjPtr == nullptr)
		{
			continue;
		}
		const TSharedPtr<FJsonObject>& Obj = *ObjPtr;

		FKBVENpcDef Def;

		FString Str;
		if (Obj->TryGetStringField(TEXT("ref"), Str)) Def.Ref = FName(*Str);
		if (Def.Ref.IsNone()) continue;

		Obj->TryGetStringField(TEXT("id"), Def.Id);
		Obj->TryGetStringField(TEXT("name"), Def.Name);
		Obj->TryGetNumberField(TEXT("level"), Def.Level);
		Obj->TryGetNumberField(TEXT("typeFlags"), Def.TypeFlags);
		if (Obj->TryGetStringField(TEXT("family"), Str)) Def.Family = FName(*Str);

		const TSharedPtr<FJsonObject>* StatsObj = nullptr;
		if (Obj->TryGetObjectField(TEXT("stats"), StatsObj) && StatsObj)
		{
			GetFloat(*StatsObj, TEXT("hp"), Def.Stats.HP);
			GetFloat(*StatsObj, TEXT("maxHp"), Def.Stats.MaxHP);
			GetFloat(*StatsObj, TEXT("attack"), Def.Stats.Attack);
			GetFloat(*StatsObj, TEXT("defense"), Def.Stats.Defense);
			GetFloat(*StatsObj, TEXT("speed"), Def.Stats.Speed);
			GetFloat(*StatsObj, TEXT("armor"), Def.Stats.Armor);
			GetFloat(*StatsObj, TEXT("mp"), Def.Stats.MP);
			GetFloat(*StatsObj, TEXT("maxMp"), Def.Stats.MaxMP);
			GetFloat(*StatsObj, TEXT("ep"), Def.Stats.EP);
			GetFloat(*StatsObj, TEXT("maxEp"), Def.Stats.MaxEP);
			if (Def.Stats.MaxHP <= 0.f) Def.Stats.MaxHP = Def.Stats.HP;
		}

		const TSharedPtr<FJsonObject>* BehaviorObj = nullptr;
		if (Obj->TryGetObjectField(TEXT("behavior"), BehaviorObj) && BehaviorObj)
		{
			GetFloat(*BehaviorObj, TEXT("aggroRange"), Def.AggroRange);
			(*BehaviorObj)->TryGetBoolField(TEXT("firstStrike"), Def.bFirstStrike);
		}

		const TSharedPtr<FJsonObject>* FactionObj = nullptr;
		if (Obj->TryGetObjectField(TEXT("faction"), FactionObj) && FactionObj)
		{
			if ((*FactionObj)->TryGetStringField(TEXT("factionId"), Str)) Def.FactionId = FName(*Str);
		}

		const TArray<TSharedPtr<FJsonValue>>* Abilities = nullptr;
		if (Obj->TryGetArrayField(TEXT("abilities"), Abilities) && Abilities)
		{
			for (const TSharedPtr<FJsonValue>& A : *Abilities)
			{
				const TSharedPtr<FJsonObject>* AObj = nullptr;
				if (A.IsValid() && A->TryGetObject(AObj) && AObj)
				{
					FString AbilityId;
					if ((*AObj)->TryGetStringField(TEXT("id"), AbilityId))
					{
						Def.AbilityIds.Add(FName(*AbilityId));
					}
				}
			}
		}

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

		RefToIndex.Add(Def.Ref, Npcs.Num());
		Npcs.Add(MoveTemp(Def));
	}

	UE_LOG(LogTemp, Log, TEXT("[KBVENPCDB] loaded %d npc defs"), Npcs.Num());
	return true;
}

const FKBVENpcDef* UKBVENpcDatabase::FindByRef(FName Ref) const
{
	if (const int32* Index = RefToIndex.Find(Ref))
	{
		return &Npcs[*Index];
	}
	return nullptr;
}

bool UKBVENpcDatabase::GetNpcByRef(FName Ref, FKBVENpcDef& OutDef) const
{
	if (const FKBVENpcDef* Def = FindByRef(Ref))
	{
		OutDef = *Def;
		return true;
	}
	return false;
}
